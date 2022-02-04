#![allow(clippy::comparison_chain)]

use std::collections::{HashSet};

use ldap3::{Mod};


use crate::my_types::*;
use crate::ldap_wrapper::{LdapW, Result, MyErr};
use crate::my_ldap::{self, user_urls_, user_has_right_on_sgroup_filter};
use crate::my_ldap::{url_to_dn, url_to_dn_};
use crate::ldap_filter;

async fn user_has_right_on_at_least_one_sgroups(ldp: &mut LdapW<'_>, user_urls: &HashSet<String>, ids: Vec<&str>, right: &Right) -> Result<bool> {    
    let ids_filter = ldap_filter::or(ids.into_iter().map(|id| ldp.config.sgroup_filter(id)).collect());
    let filter = ldap_filter::and2(
        &ids_filter,
        &user_has_right_on_sgroup_filter(user_urls, right),
    );
    
    //user_has_right_on_sgroup_filter(right);
    Ok(ldp.one_group_matches_filter(&filter).await?)
}

/*async fn user_has_right_on_group(ldp: &mut LdapW<'_>, user: &str, id: &str, right: &Right) -> Result<bool> {    
    let filter = user_has_direct_right_on_group_filter(&ldp.config.people_id_to_dn(user), right);
    ldp.is_sgroup_matching_filter(id, &filter).await
}*/

async fn check_right_on_any_parents(ldp: &mut LdapW<'_>, id: &str, right: Right) -> Result<()> {
    match ldp.logged_user {
        LoggedUser::TrustedAdmin => {
            if let Some(parent_stem) = ldp.config.stem.parent_stem(id) {
                if !ldp.is_sgroup_existing(parent_stem).await? { 
                    return Err(MyErr::Msg(format!("stem {} does not exist", parent_stem)))
                }    
            }
            Ok(())
        },
        LoggedUser::User(user) => {
            eprintln!("  check_right_on_any_parents({}, {:?})", id, right);
            let user_urls = user_urls_(ldp, user).await?;
            let parents = ldp.config.stem.parent_stems(id);
            if user_has_right_on_at_least_one_sgroups(ldp, &user_urls, parents, &right).await? {
                Ok(())
            } else {
                Err(MyErr::Msg(format!("no right on {} parents", id)))
            }
        }
    }
}

async fn check_right_on_self_or_any_parents(ldp: &mut LdapW<'_>, id: &str, right: Right) -> Result<()> {
    match ldp.logged_user {
        LoggedUser::TrustedAdmin => {
            Ok(())
        },
        LoggedUser::User(user) => {
            eprintln!("  check_right_on_self_or_any_parents({}, {:?})", id, right);
            let user_urls = user_urls_(ldp, user).await?;
            let self_and_parents = [
                vec![id],
                ldp.config.stem.parent_stems(id),
            ].concat();
            if user_has_right_on_at_least_one_sgroups(ldp, &user_urls, self_and_parents, &right).await? {
                Ok(())
            } else {
                Err(MyErr::Msg(format!("no right on {}", id)))
            }
        }
    }
}

pub async fn create(cfg_and_lu: CfgAndLU<'_>, id: &str, attrs: MonoAttrs) -> Result<()> {
    eprintln!("create({}, _)", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    cfg_and_lu.cfg.ldap.validate_sgroups_attrs(&attrs)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    check_right_on_any_parents(ldp, id, Right::Admin).await?;
    my_ldap::create_sgroup(ldp, id, attrs).await?;
    Ok(())
}

pub async fn modify_sgroup_attrs(cfg_and_lu: CfgAndLU<'_>, id: &str, attrs: MonoAttrs) -> Result<()> {
    eprintln!("modify_attrs({}, _)", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    cfg_and_lu.cfg.ldap.validate_sgroups_attrs(&attrs)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    check_right_on_self_or_any_parents(ldp, id, Right::Admin).await?;
    my_ldap::modify_sgroup_attrs(ldp, id, attrs).await?;
    Ok(())
}

pub async fn delete(cfg_and_lu: CfgAndLU<'_>, id: &str) -> Result<()> {
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    // are we allowed?
    check_right_on_self_or_any_parents(ldp, id, Right::Admin).await?;
    // is it possible?
    if ldp.one_group_matches_filter(&ldap_filter::sgroup_children(id)).await? { 
        return Err(MyErr::Msg("can not remove stem with existing children".to_owned()))
    }
    // ok, do it:
    ldp.delete_sgroup(id).await?;
    Ok(())
}

// which Right is needed for these modifications?
fn my_mods_to_right(my_mods: &MyMods) -> Right {
    for right in my_mods.keys() {
        if right > &Mright::Reader {
            return Right::Admin
        }
    }
    Right::Updater
}

// Check validity of modifications
// - stems do not allow members
// - "sql://xxx?..." URLs are only allowed:
//   - as members (not updaters/admins/...)
//   - only one URL is accepted (for simplicity in web interface + similar restriction as in Internet2 Grouper)
//   - modification must be a Replace (checking mods is simpler that way)
fn check_mods(is_stem: bool, my_mods: &MyMods) -> Result<()> {
    for (right, submods) in my_mods {
        if right == &Mright::Member && is_stem {
            return Err(MyErr::Msg("members are not allowed for stems".to_owned()))
        }
        for (action, list) in submods {
            if action == &MyMod::Replace && list.len() == 1 && right == &Mright::Member {
                // only case where non DNs are allowed!
            } else if let Some(url) = list.iter().find(|url| url_to_dn(url).is_none()) {
                return Err(MyErr::Msg(format!("non DN URL {} is now allowed", url)))
            }
        }
    }
    Ok(())
}

// Search for groups having this group DN in their member/supannGroupeLecteurDN/supannAdminDN/owner
async fn search_groups_mrights_depending_on_this_group(ldp: &mut LdapW<'_>, id: &str) -> Result<Vec<(String, Mright)>> {
    let mut r = vec![];
    let group_dn = ldp.config.sgroup_id_to_dn(id);
    for mright in Mright::list() {
        for id in ldp.search_sgroups_id(&ldap_filter::eq(ldp.config.to_flattened_attr(mright), &group_dn)).await? {
            r.push((id, mright));
        }
    }
    Ok(r)
}

enum UpResult { Modified, Unchanged }

async fn may_update_flattened_mrights_(ldp: &mut LdapW<'_>, id: &str, mright: Mright, to_add: HashSet<&str>, to_remove: HashSet<&str>) -> Result<UpResult> {
    let attr = ldp.config.to_flattened_attr(mright);
    let mods = [
        if to_add.is_empty()    { vec![] } else { vec![ Mod::Add(attr, to_add) ] },
        if to_remove.is_empty() { vec![] } else { vec![ Mod::Delete(attr, to_remove) ] },
    ].concat();
    if mods.is_empty() {
        return Ok(UpResult::Unchanged)
    }
    let res = dbg!(ldp.ldap.modify(dbg!(&ldp.config.sgroup_id_to_dn(id)), dbg!(mods)).await?);
    if res.rc != 0 {
        Err(MyErr::Msg(format!("update_flattened_mright failed on {}: {}", id, res)))
    } else {
        Ok(UpResult::Modified)
    }
}

async fn get_flattened_dns(ldp: &mut LdapW<'_>, direct_dns: &HashSet<String>) -> Result<HashSet<String>> {
    let mut r = direct_dns.clone();
    for dn in direct_dns {
        if ldp.config.dn_is_sgroup(dn) {
            r.extend(ldp.read_flattened_mright(dn, Mright::Member).await?);
        }
    }
    Ok(r)
}

// read group direct URLs
// diff with group flattened DNs
// if needed, update group flattened DNs
async fn may_update_flattened_mrights(ldp: &mut LdapW<'_>, id: &str, mright: Mright) -> Result<UpResult> {
    eprintln!("  may_update_flattened_mrights({}, {:?})", id, mright);
    let group_dn = ldp.config.sgroup_id_to_dn(id);
    let direct_urls = ldp.read_one_multi_attr__or_err(&group_dn, &mright.to_attr()).await?;
    if let Some(direct_dns) = direct_urls.into_iter().map(url_to_dn_).collect::<Option<HashSet<_>>>() {
        let mut flattened_dns = get_flattened_dns(ldp, &direct_dns).await?;
        if flattened_dns.is_empty() && mright == Mright::Member {
            flattened_dns.insert("".to_owned());
        }
        let current_flattened_dns = HashSet::from_iter(
            ldp.read_one_multi_attr__or_err(&group_dn, ldp.config.to_flattened_attr(mright)).await?
        );
        let to_add = flattened_dns.difference(&current_flattened_dns).map(|s| s.as_str()).collect();
        let to_remove = current_flattened_dns.difference(&flattened_dns).map(|s| s.as_str()).collect();
        may_update_flattened_mrights_(ldp, id, mright, dbg!(to_add), dbg!(to_remove)).await
    } else {
        // TODO: non DN URL
        Ok(UpResult::Unchanged)
    }
}

async fn may_update_flattened_mrights_rec(ldp: &mut LdapW<'_>, mut todo: Vec<(String, Mright)>) -> Result<()> {
    while let Some((id, mright)) = todo.pop() {
        let result = may_update_flattened_mrights(ldp, &id, mright).await?;
        if let (Mright::Member, UpResult::Modified) = (mright, &result) {
            todo.append(&mut search_groups_mrights_depending_on_this_group(ldp, &id).await?);
        }    
    }
    Ok(())
}

pub async fn modify_members_or_rights(cfg_and_lu: CfgAndLU<'_>, id: &str, my_mods: MyMods) -> Result<()> {
    eprintln!("modify_members_or_rights({}, _)", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    // is logged user allowed to do the modifications?
    check_right_on_self_or_any_parents(ldp, id, my_mods_to_right(&my_mods)).await?;
    // are the modifications valid?
    let is_stem = ldp.config.stem.is_stem(id);
    check_mods(is_stem, &my_mods)?;

    let todo_flattened = if is_stem { vec![] } else {
        my_mods.keys().map(|mright| (id.to_owned(), *mright)).collect()
    };

    // ok, let's do update direct mrights:
    my_ldap::modify_direct_members_or_rights(ldp, id, my_mods).await?;
    // then update flattened groups mrights
    may_update_flattened_mrights_rec(ldp, todo_flattened).await?;

    Ok(())
}

