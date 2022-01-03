use std::collections::{HashSet};

use ldap3::{LdapResult, SearchEntry};
use ldap3::result::{Result, LdapError};

use super::my_types::{Attrs, GroupKind, MyMods, Right, LoggedUser};
use super::ldap_wrapper;
use super::ldap_wrapper::{LdapW, one_group_matches_filter};
use super::my_ldap;
use super::my_ldap::{sgroup_id_to_dn, people_id_to_dn, dn_to_url};
use super::ldap_filter;

// true if at least one LDAP entry value is in "set"
fn has_value(entry: SearchEntry, set: HashSet<String>) -> bool {
    for vals in entry.attrs.into_values() {
        if vals.iter().any(|url| set.contains(url)) {
            return true
        }
    }
    false
}

async fn user_has_right_on_stem(ldp: &mut LdapW<'_>, user: &str, id: &str, right: &Right) -> Result<bool> {
    if let Some(group) = {
        let attrs: Vec<String> = right.to_allowed_rights().iter().map(|r| r.to_attr()).collect();
        let dn = sgroup_id_to_dn(&ldp.config, id);
        ldap_wrapper::read(ldp, &dn, attrs).await?
     } {
        let user_urls: HashSet<String> = {
            let user_dn = people_id_to_dn(&ldp.config, user);
            let user_groups = my_ldap::user_groups(ldp, &user_dn).await?;
            user_groups.union(&hashset![user_dn]).map(|dn| dn_to_url(&dn)).collect()
        };
        Ok(has_value(group, user_urls))
    } else if id == ldp.config.stem.root_id {
        Ok(false)
    } else {
        Err(LdapError::AdapterInit(format!("stem {} does not exist", id)))
    }
}

async fn user_has_right_on_group(ldp: &mut LdapW<'_>, user: &str, id: &str, right: &Right) -> Result<bool> {    
    let user_has_right_filter = {
        let user_dn = &people_id_to_dn(&ldp.config, user);
        ldap_filter::or(right.to_allowed_rights().iter().map(|r| 
            ldap_filter::eq(r.to_indirect_attr(), user_dn)
        ).collect())
    };
    my_ldap::is_sgroup_matching_filter(ldp, id, &user_has_right_filter).await
}

async fn user_has_right(ldp: &mut LdapW<'_>, user: &str, id: &str, right: &Right) -> Result<bool> {
    if my_ldap::is_stem(ldp, id).await? {
        user_has_right_on_stem(ldp, user, id, right).await
    } else {
        user_has_right_on_group(ldp, user, id, right).await
    }
}

async fn check_right_on_parents(ldp: &mut LdapW<'_>, id: &str, right: Right) -> Result<()> {
    match ldp.logged_user {
        LoggedUser::TrustedAdmin => {
            if let Some(parent_stem) = my_ldap::parent_stem(&ldp.config.stem, id) {
                if !my_ldap::is_sgroup_existing(ldp, &parent_stem).await? { 
                    return Err(LdapError::AdapterInit(format!("stem {} does not exist", parent_stem)))
                }    
            }
            Ok(())
        },
        LoggedUser::User(user) => {
            let parents = my_ldap::parent_stems(&ldp.config.stem, id);
            for parent in parents {
                if user_has_right_on_stem(ldp, user, parent, &right).await? {
                    return Ok(())
                }
            }
            Err(LdapError::AdapterInit("not enough right".to_owned()))
        }
    }
}

async fn check_right_on_self_or_parents(ldp: &mut LdapW<'_>, id: &str, right: Right) -> Result<()> {
    match ldp.logged_user {
        LoggedUser::TrustedAdmin => {
            Ok(())
        },
        LoggedUser::User(user) => {
            if user_has_right(ldp, user, id, &right).await? {
                return Ok(())
            }
            check_right_on_parents(ldp, id, right).await
        }
    }
}

pub async fn create(ldp: &mut LdapW<'_>, kind: GroupKind, id: &str, attrs: Attrs) -> Result<LdapResult> {
    check_right_on_parents(ldp, id, Right::ADMIN).await?;
    my_ldap::create(ldp, kind, id, attrs).await
}

pub async fn delete(ldp: &mut LdapW<'_>, id: &str) -> Result<LdapResult> {
    check_right_on_self_or_parents(ldp, id, Right::ADMIN).await?;
    if one_group_matches_filter(ldp, &ldap_filter::sgroup_children(id)).await? { 
        return Err(LdapError::AdapterInit("can not remove stem with existing children".to_owned()))
    }
    my_ldap::delete(ldp, id).await
}

pub async fn modify_members_or_rights(ldp: &mut LdapW<'_>, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    my_ldap::modify_direct_members_or_rights(ldp, id, my_mods).await
    // TODO update indirect + propagate indirect
}

