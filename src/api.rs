use std::collections::{HashSet};

use ldap3::{LdapResult, SearchEntry};
use ldap3::result::{Result, LdapError};

use super::my_types::{Attrs, GroupKind, MyMods, Right, LoggedUser};
use super::ldap_wrapper::LdapW;
use super::my_ldap;
use super::my_ldap::{dn_to_url};
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
        let attrs = right.to_allowed_rights().iter().map(|r| r.to_attr()).collect();
        ldp.read_sgroup(id, attrs).await?
     } {
        let user_urls = ldp.user_groups_and_user(user).await?.iter().map(|dn| dn_to_url(&dn)).collect();
        Ok(has_value(group, user_urls))
    } else if id == ldp.config.stem.root_id {
        Ok(false)
    } else {
        Err(LdapError::AdapterInit(format!("stem {} does not exist", id)))
    }
}

async fn user_has_right_on_group(ldp: &mut LdapW<'_>, user: &str, id: &str, right: &Right) -> Result<bool> {    
    fn user_has_right_filter(user_dn: &str, right: &Right) -> String {
        ldap_filter::or(right.to_allowed_rights().iter().map(|r| 
            ldap_filter::eq(r.to_indirect_attr(), user_dn)
        ).collect())
    }
    let filter = user_has_right_filter(&ldp.config.people_id_to_dn(user), right);
    ldp.is_sgroup_matching_filter(id, &filter).await
}

async fn user_has_right(ldp: &mut LdapW<'_>, user: &str, id: &str, right: &Right) -> Result<bool> {
    if ldp.is_stem(id).await? {
        user_has_right_on_stem(ldp, user, id, right).await
    } else {
        user_has_right_on_group(ldp, user, id, right).await
    }
}

async fn check_right_on_parents(ldp: &mut LdapW<'_>, id: &str, right: Right) -> Result<()> {
    match ldp.logged_user {
        LoggedUser::TrustedAdmin => {
            if let Some(parent_stem) = my_ldap::parent_stem(&ldp.config.stem, id) {
                if !ldp.is_sgroup_existing(&parent_stem).await? { 
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
    my_ldap::create_sgroup(ldp, kind, id, attrs).await
}

pub async fn delete(ldp: &mut LdapW<'_>, id: &str) -> Result<LdapResult> {
    check_right_on_self_or_parents(ldp, id, Right::ADMIN).await?;
    if ldp.one_group_matches_filter(&ldap_filter::sgroup_children(id)).await? { 
        return Err(LdapError::AdapterInit("can not remove stem with existing children".to_owned()))
    }
    ldp.delete_sgroup(id).await
}

pub async fn modify_members_or_rights(ldp: &mut LdapW<'_>, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    my_ldap::modify_direct_members_or_rights(ldp, id, my_mods).await
    // TODO update indirect + propagate indirect
}

