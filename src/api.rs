use std::collections::{HashSet, HashMap};

use ldap3::{LdapResult, SearchEntry};
use ldap3::result::{Result, LdapError};

use super::my_types::*;
use super::ldap_wrapper::LdapW;
use super::my_ldap;
use super::my_ldap::{dn_to_url, url_to_dn};
use super::ldap_filter;

fn is_disjoint(vals: &Vec<String>, set: &HashSet<String>) -> bool {
    !vals.iter().any(|val| set.contains(val))
}

// true if at least one LDAP entry value is in "set"
fn has_value(entry: SearchEntry, set: &HashSet<String>) -> bool {
    for vals in entry.attrs.into_values() {
        if !is_disjoint(&vals, &set) {
            return true
        }
    }
    false
}

async fn user_urls(ldp: &mut LdapW<'_>, user: &str) -> Result<HashSet<String>> {
    Ok(ldp.user_groups_and_user(user).await?.iter().map(|dn| dn_to_url(&dn)).collect())
}

async fn user_has_right_on_sgroup(ldp: &mut LdapW<'_>, user_urls: &HashSet<String>, id: &str, right: &Right) -> Result<bool> {
    if let Some(group) = ldp.read_sgroup(id, right.to_allowed_attrs()).await? {
        Ok(has_value(group, user_urls))
    } else if id == ldp.config.stem.root_id {
        Ok(false)
    } else {
        Err(LdapError::AdapterInit(format!("stem {} does not exist", id)))
    }
}

async fn user_highest_right_on_stem(ldp: &mut LdapW<'_>, user_urls: &HashSet<String>, id: &str) -> Result<Option<Right>> {
    if let Some(group) = ldp.read_sgroup(id, Right::READER.to_allowed_attrs()).await? {
        for right in Right::READER.to_allowed_rights() {
            if let Some(vals) = group.attrs.get(&right.to_attr()) {
                if !is_disjoint(vals, &user_urls) {
                    return Ok(Some(right))
                }
            }
        }
        Ok(None)
    } else if id == ldp.config.stem.root_id {
        Ok(None)
    } else {
        Err(LdapError::AdapterInit(format!("stem {} does not exist", id)))
    }
}


/*async fn user_has_right_on_group(ldp: &mut LdapW<'_>, user: &str, id: &str, right: &Right) -> Result<bool> {    
    fn user_has_right_filter(user_dn: &str, right: &Right) -> String {
        ldap_filter::or(right.to_allowed_rights().iter().map(|r| 
            ldap_filter::eq(r.to_indirect_attr(), user_dn)
        ).collect())
    }
    let filter = user_has_right_filter(&ldp.config.people_id_to_dn(user), right);
    ldp.is_sgroup_matching_filter(id, &filter).await
}*/

async fn check_user_right_on_any_parents(ldp: &mut LdapW<'_>, user_urls: &HashSet<String>, id: &str, right: Right) -> Result<()> {
    let parents = ldp.config.stem.parent_stems(id);
    for parent in parents {
        if user_has_right_on_sgroup(ldp, &user_urls, parent, &right).await? {
            return Ok(())
        }
    }
    Err(LdapError::AdapterInit("not enough right".to_owned()))
}

async fn check_right_on_any_parents(ldp: &mut LdapW<'_>, id: &str, right: Right) -> Result<()> {
    match ldp.logged_user {
        LoggedUser::TrustedAdmin => {
            if let Some(parent_stem) = ldp.config.stem.parent_stem(id) {
                if !ldp.is_sgroup_existing(&parent_stem).await? { 
                    return Err(LdapError::AdapterInit(format!("stem {} does not exist", parent_stem)))
                }    
            }
            Ok(())
        },
        LoggedUser::User(user) => {
            dbg!("check_right_on_any_parents");
            let user_urls = user_urls(ldp, user).await?;
            dbg!(&user_urls);
            check_user_right_on_any_parents(ldp, &user_urls, id, right).await
        }
    }
}

async fn check_right_on_self_or_any_parents(ldp: &mut LdapW<'_>, id: &str, right: Right) -> Result<()> {
    match ldp.logged_user {
        LoggedUser::TrustedAdmin => {
            Ok(())
        },
        LoggedUser::User(user) => {
            let user_urls = user_urls(ldp, user).await?;
            dbg!(&user_urls);
            if user_has_right_on_sgroup(ldp, &user_urls, id, &right).await? {
                return Ok(())
            }
            check_user_right_on_any_parents(ldp, &user_urls, id, right).await
        }
    }
}

async fn best_right_on_self_or_any_parents(ldp: &mut LdapW<'_>, id: &str) -> Result<Option<Right>> {
    match ldp.logged_user {
        LoggedUser::TrustedAdmin => {
            Ok(Some(Right::ADMIN))
        },
        LoggedUser::User(user) => {
            dbg!("best_right_on_self_or_any_parents()");
            let user_urls = user_urls(ldp, user).await?;
            dbg!(&user_urls);
            let self_and_parents = [ ldp.config.stem.parent_stems(id), vec![id] ].concat();
            let mut best = None;
            for id in self_and_parents {
                let right = user_highest_right_on_stem(ldp, &user_urls, id).await?;
                dbg!(id); dbg!(&right); 
                if right > best {
                    best = right;
                    dbg!(&best);
                }
            }
            Ok(best)
        }
    }
}


pub async fn create<'a>(cfg_and_lu: CfgAndLU<'a>, kind: GroupKind, id: &str, attrs: Attrs) -> Result<LdapResult> {
    dbg!(id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    check_right_on_any_parents(ldp, id, Right::ADMIN).await?;
    my_ldap::create_sgroup(ldp, kind, id, attrs).await
}

pub async fn delete<'a>(cfg_and_lu: CfgAndLU<'a>, id: &str) -> Result<LdapResult> {
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    // are we allowed?
    check_right_on_self_or_any_parents(ldp, id, Right::ADMIN).await?;
    // is it possible?
    if ldp.one_group_matches_filter(&ldap_filter::sgroup_children(id)).await? { 
        return Err(LdapError::AdapterInit("can not remove stem with existing children".to_owned()))
    }
    // ok, do it:
    ldp.delete_sgroup(id).await
}

// which Right is needed for these modifications?
fn my_mods_to_right(my_mods: &MyMods) -> Right {
    for (right, _) in my_mods {
        if right > &Mright::READER {
            return Right::ADMIN
        }
    }
    Right::UPDATER
}

// Check validity of modifications
// - stems do not allow members
// - "sql://xxx?..." URLs are only allowed:
//   - as members (not updaters/admins/...)
//   - only one URL is accepted (for simplicity in web interface + similar restriction as in Internet2 Grouper)
//   - modification must be a REPLACE (checking mods is simpler that way)
fn check_mods(is_stem: bool, my_mods: &MyMods) -> Result<()> {
    for (right, submods) in my_mods {
        if right == &Mright::MEMBER && is_stem {
            return Err(LdapError::AdapterInit(format!("members are not allowed for stems")))
        }
        for (action, list) in submods {
            if action == &MyMod::REPLACE && list.len() == 1 && right == &Mright::MEMBER {
                // only case where non DNs are allowed!
            } else if let Some(url) = list.iter().find(|url| url_to_dn(url).is_none()) {
                return Err(LdapError::AdapterInit(format!("non DN URL {} is now allowed", url)))
            }
        }
    }
    Ok(())
}

pub async fn modify_members_or_rights<'a>(cfg_and_lu: CfgAndLU<'a>, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    dbg!(id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    // is logged user allowed to do the modifications?
    check_right_on_self_or_any_parents(ldp, id, my_mods_to_right(&my_mods)).await?;
    // are the modifications valid?
    check_mods(ldp.is_stem(id).await?, &my_mods)?;
    // ok, let's do it:
    my_ldap::modify_direct_members_or_rights(ldp, id, my_mods).await

    // TODO update indirect + propagate indirect
}

fn contains_ref(l: &Vec<String>, s: &str) -> bool {
    l.iter().any(|e| e == s)
}

fn is_stem(entry: &SearchEntry) -> bool {
    if let Some(vals) = entry.attrs.get("objectClass") {
        !contains_ref(vals, "groupOfNames")
    } else {
        false
    }
}

fn get_sgroups_attrs(attrs: HashMap<String, Vec<String>>) -> Attrs {
    attrs.into_iter().filter_map(|(attr, val)| {
        let attr = Attr::from_string(&attr)?;
        let one = val.into_iter().next()?;
        Some((attr, one))
    }).collect()
}

pub async fn get_sgroup<'a>(cfg_and_lu: CfgAndLU<'a>, id: &str) -> Result<SgroupAndRight> {
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;

    let wanted_attrs = [ Attr::list_as_string(), vec![ "objectClass" ] ].concat();
    if let Some(entry) = ldp.read_sgroup(id, wanted_attrs).await? {
        let kind = if is_stem(&entry) { GroupKind::STEM } else { GroupKind::GROUP };
        let attrs = get_sgroups_attrs(entry.attrs);
        let sgroup = SgroupOut { attrs, kind };
        let right = best_right_on_self_or_any_parents(ldp, id).await?
                .ok_or_else(|| LdapError::AdapterInit("not enough right".to_owned()))?;
        Ok(SgroupAndRight { sgroup, right })
    } else {
        Err(LdapError::AdapterInit(format!("sgroup {} does not exist", id)))
    }
}

pub async fn get_children<'a>(cfg_and_lu: CfgAndLU<'a>, id: &str) -> Result<()> {
    // Vec<Attrs + "kind">
    Ok(())
}
