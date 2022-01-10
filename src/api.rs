use std::collections::{BTreeMap, HashSet, HashMap};

use ldap3::{SearchEntry, Mod};
use ldap3::result::{Result, LdapError};

use crate::my_types::*;
use crate::ldap_wrapper::LdapW;
use crate::my_ldap;
use crate::my_ldap::{dn_to_url, url_to_dn, url_to_dn_};
use crate::ldap_filter;

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
    let r = Ok(ldp.user_groups_and_user_dn(user).await?.iter().map(|dn| dn_to_url(&dn)).collect());
    eprintln!("    user_urls({}) => {:?}", user, r);
    r
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
            if let Some(urls) = group.attrs.get(&right.to_attr()) {
                if !is_disjoint(urls, &user_urls) {
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
            ldap_filter::eq(r.to_flattened_attr(), user_dn)
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
    Err(LdapError::AdapterInit(format!("no right on {} parents", id)))
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
            eprintln!("  check_right_on_any_parents({}, {:?})", id, right);
            let user_urls = user_urls(ldp, user).await?;
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
            eprintln!("  check_right_on_self_or_any_parents({}, {:?})", id, right);
            let user_urls = user_urls(ldp, user).await?;
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
            eprintln!("  best_right_on_self_or_any_parents({}) with user {}", id, user);
            let user_urls = user_urls(ldp, user).await?;
            let self_and_parents = [ ldp.config.stem.parent_stems(id), vec![id] ].concat();
            let mut best = None;
            for id in self_and_parents {
                let right = user_highest_right_on_stem(ldp, &user_urls, id).await?;
                eprintln!("    best_right_on_self_or_any_parents: {} => {:?}", id, right);
                if right > best {
                    best = right;
                }
            }
            eprintln!("  best_right_on_self_or_any_parents({}) with user {} => {:?}", id, user, best);
            Ok(best)
        }
    }
}


pub async fn create<'a>(cfg_and_lu: CfgAndLU<'a>, id: &str, attrs: SgroupAttrs) -> Result<()> {
    eprintln!("create({}, _)", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    check_right_on_any_parents(ldp, id, Right::ADMIN).await?;
    my_ldap::create_sgroup(ldp, id, attrs).await
}

pub async fn delete<'a>(cfg_and_lu: CfgAndLU<'a>, id: &str) -> Result<()> {
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    // are we allowed?
    check_right_on_self_or_any_parents(ldp, id, Right::ADMIN).await?;
    // is it possible?
    if ldp.one_group_matches_filter(&ldap_filter::sgroup_children(id)).await? { 
        return Err(LdapError::AdapterInit("can not remove stem with existing children".to_owned()))
    }
    // ok, do it:
    ldp.delete_sgroup(id).await?;
    Ok(())
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

// Search for groups having this group DN in their member/supannGroupeLecteurDN/supannAdminDN/owner
async fn search_groups_mrights_depending_on_this_group(ldp: &mut LdapW<'_>, id: &str) -> Result<Vec<(String, Mright)>> {
    let mut r = vec![];
    let group_dn = ldp.config.sgroup_id_to_dn(id);
    for mright in Mright::list() {
        for id in ldp.search_sgroups_id(&ldap_filter::eq(mright.to_flattened_attr(), &group_dn)).await? {
            r.push((id, mright));
        }
    }
    Ok(r)
}

enum UpResult { Modified, Unchanged }

async fn may_update_flattened_mrights_(ldp: &mut LdapW<'_>, id: &str, mright: Mright, to_add: HashSet<&str>, to_remove: HashSet<&str>) -> Result<UpResult> {
    let attr = mright.to_flattened_attr();
    let mods = [
        if to_add.is_empty()    { vec![] } else { vec![ Mod::Add(attr, to_add) ] },
        if to_remove.is_empty() { vec![] } else { vec![ Mod::Delete(attr, to_remove) ] },
    ].concat();
    if mods.is_empty() {
        return Ok(UpResult::Unchanged)
    }
    let res = dbg!(ldp.ldap.modify(dbg!(&ldp.config.sgroup_id_to_dn(id)), dbg!(mods)).await?);
    if res.rc != 0 {
        Err(LdapError::AdapterInit(format!("update_flattened_mright failed on {}: {}", id, res)))
    } else {
        Ok(UpResult::Modified)
    }
}

async fn get_flattened_dns(ldp: &mut LdapW<'_>, direct_dns: &HashSet<String>, mright: Mright) -> Result<HashSet<String>> {
    let mut r = direct_dns.clone();
    for dn in direct_dns {
        if ldp.config.dn_is_sgroup(dn) {
            r.extend(ldp.read_flattened_mright(&dn, mright).await?);
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
    if let Some(direct_dns) = direct_urls.into_iter().map(|url| url_to_dn_(url)).collect::<Option<HashSet<_>>>() {
        let mut flattened_dns = get_flattened_dns(ldp, &direct_dns, mright).await?;
        if flattened_dns.is_empty() && mright == Mright::MEMBER {
            flattened_dns.insert("".to_owned());
        }
        let current_flattened_dns = HashSet::from_iter(
            ldp.read_one_multi_attr__or_err(&group_dn, &mright.to_flattened_attr()).await?
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
        if let (Mright::MEMBER, UpResult::Modified) = (mright, &result) {
            todo.append(&mut search_groups_mrights_depending_on_this_group(ldp, &id).await?);
        }    
    }
    Ok(())
}

pub async fn modify_members_or_rights<'a>(cfg_and_lu: CfgAndLU<'a>, id: &str, my_mods: MyMods) -> Result<()> {
    eprintln!("modify_members_or_rights({}, _)", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    // is logged user allowed to do the modifications?
    check_right_on_self_or_any_parents(ldp, id, my_mods_to_right(&my_mods)).await?;
    // are the modifications valid?
    let is_stem = ldp.config.stem.is_stem(id);
    check_mods(is_stem, &my_mods)?;

    let todo_flattened = if is_stem { vec![] } else {
        my_mods.keys().map(|mright| (id.to_owned(), mright.clone())).collect()
    };

    // ok, let's do update direct mrights:
    my_ldap::modify_direct_members_or_rights(ldp, id, my_mods).await?;
    // then update flattened groups mrights
    may_update_flattened_mrights_rec(ldp, todo_flattened).await?;

    Ok(())
}

/*fn contains_ref(l: &Vec<String>, s: &str) -> bool {
    l.iter().any(|e| e == s)
}*/

fn attrs_to_sgroup_attrs(attrs: HashMap<String, Vec<String>>) -> SgroupAttrs {
    attrs.into_iter().filter_map(|(attr, val)| {
        let attr = Attr::from_string(&attr)?;
        let one = val.into_iter().next()?;
        Some((attr, one))
    }).collect()
}

/*
fn shallow_copy_vec(v : &Vec<String>) -> Vec<&str> {
    v.iter().map(AsRef::as_ref).collect()
}

async fn subject_to_attrs<'a>(ldp: &mut LdapW<'_>, dn: &str) -> Result<SubjectAttrs> {
    let sscfg = ldp.config.dn_to_subject_source_cfg(dn)
            .ok_or_else(|| LdapError::AdapterInit(format!("DN {} has no corresponding subject source", dn)))?;
    subject_to_attrs_(ldp, dn, sscfg).await
}

async fn subject_to_attrs_<'a>(ldp: &mut LdapW<'_>, dn: &str, sscfg: &SubjectSourceConfig) -> Result<SubjectAttrs> {
    let entry = ldp.read(dn, shallow_copy_vec(&sscfg.display_attrs)).await?
            .ok_or_else(|| LdapError::AdapterInit(format!("invalid DN {}", dn)))?;
    Ok(mono_attrs(entry.attrs))
}
*/

async fn get_subjects_from_same_source<'a>(ldp: &mut LdapW<'_>, sscfg: &SubjectSourceConfig, dns: &[String], search_token: &Option<String>) -> Result<Subjects> {
    let dns_filter = ldap_filter::or(dns.iter().map(|dn| ldap_filter::dn(dn.as_str())).collect());
    let filter = if let Some(term) = search_token {
        let term_filter = sscfg.search_filter.replace("%TERM%", term).replace(" ", "");
        ldap_filter::and2(&dns_filter,&term_filter)
    } else {
        dns_filter
    };
    ldp.search_subjects(sscfg, dbg!(&filter)).await
}




async fn get_subjects_from_urls<'a>(ldp: &mut LdapW<'_>, urls: Vec<String>) -> Result<Subjects> {
    get_subjects(ldp, urls.into_iter().filter_map(url_to_dn_).collect(), &None, &None).await
}

fn into_group_map<K: Eq + std::hash::Hash, V, I: Iterator<Item = (K, V)>>(iter: I) -> HashMap<K, Vec<V>> {
    iter.fold(HashMap::new(), |mut map, (k, v)| {
        map.entry(k).or_insert_with(|| Vec::new()).push(v);
        map
    })
}
async fn get_subjects<'a>(ldp: &mut LdapW<'_>, dns: Vec<String>, search_token: &Option<String>, sizelimit: &Option<usize>) -> Result<Subjects> {
    let mut r = BTreeMap::new();

    let sscfg2dns = into_group_map(dns.into_iter().filter_map(|dn| {
        let sscfg = ldp.config.dn_to_subject_source_cfg(&dn)?;
        Some((sscfg, dn))
    }));
        
    for (sscfg, dns) in sscfg2dns {
        let mut count = 0;
        for dns_ in dns.chunks(10) {
            let subjects = &mut get_subjects_from_same_source(ldp, sscfg, dns_, search_token).await?;
            count += subjects.len();
            r.append(subjects);
            if let Some(limit) = sizelimit {
                if count > *limit { break; }
            }
        }    
    }

    Ok(r)
}

pub async fn get_children(ldp: &mut LdapW<'_>, id: &str) -> Result<SgroupsWithAttrs> {
    eprintln!("  get_children({})", id);
    let wanted_attrs = Attr::list_as_string();
    let filter = ldap_filter::sgroup_children(id);
    let children = ldp.search_sgroups(&filter, wanted_attrs).await?.filter_map(|e| {
        let child_id = ldp.config.dn_to_sgroup_id(&e.dn)?;
        // ignore grandchildren
        if ldp.config.stem.is_grandchild(id, &child_id) { return None }
        let attrs: SgroupAttrs = e.attrs.into_iter().filter_map(|(attr, mut vals)| {
            Some((Attr::from_string(&attr).unwrap(), vals.pop()?))
        }).collect();
        Some((child_id, attrs))
    }).collect();
    Ok(children)
}


pub async fn get_sgroup<'a>(cfg_and_lu: CfgAndLU<'a>, id: &str) -> Result<SgroupAndMoreOut> {
    eprintln!("get_sgroup({})", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;

    let direct_member_attr = Mright::MEMBER.to_attr();
    let wanted_attrs = [ Attr::list_as_string(), vec![ &direct_member_attr ] ].concat();
    if let Some(entry) = ldp.read_sgroup(id, wanted_attrs).await? {
        let mut attrs = entry.attrs;
        let direct_members = attrs.remove(&direct_member_attr);
        //eprintln!("      read sgroup {} => {:?}", id, entry);
        let is_stem = ldp.config.stem.is_stem(id);
        let attrs = attrs_to_sgroup_attrs(attrs);
        let right = best_right_on_self_or_any_parents(ldp, id).await?
                .ok_or_else(|| LdapError::AdapterInit(format!("not right to read sgroup {}", id)))?;
        let more = if is_stem { 
            let children = get_children(ldp, id).await?;
            SgroupOutMore::Stem { children }
        } else { 
            let direct_members = get_subjects_from_urls(ldp, direct_members.unwrap_or(vec![])).await?;
            SgroupOutMore::Group { direct_members }
        };
        Ok(SgroupAndMoreOut { attrs, right, more })
    } else {
        Err(LdapError::AdapterInit(format!("sgroup {} does not exist", id)))
    }
}

pub async fn get_sgroup_direct_rights<'a>(cfg_and_lu: CfgAndLU<'a>, id: &str) -> Result<BTreeMap<Right, Subjects>> {
    eprintln!("get_sgroup_direct_rights({})", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;

    if let Some(group) = ldp.read_sgroup(id, Right::READER.to_allowed_attrs()).await? {
        let mut attrs = group.attrs;
        let mut r = btreemap![];
        for right in Right::READER.to_allowed_rights() {
            if let Some(urls) = attrs.remove(&right.to_attr()) {
                let subjects = get_subjects_from_urls(ldp, urls).await?;
                r.insert(right, subjects);
            }
        }
        Ok(r)
    } else {
        Err(LdapError::AdapterInit(format!("sgroup {} does not exist", id)))
    }
}

pub async fn get_sgroup_indirect_mright<'a>(cfg_and_lu: CfgAndLU<'a>, id: &str, mright: Mright, search_token: Option<String>, sizelimit: Option<usize>) -> Result<Subjects> {
    eprintln!("get_sgroup_indirect_mright({})", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;

    let flattened_dns = {
        let dn = ldp.config.sgroup_id_to_dn(id);
        ldp.read_flattened_mright(&dn, mright).await?
    };
    get_subjects(ldp, flattened_dns, &search_token, &sizelimit).await
}
