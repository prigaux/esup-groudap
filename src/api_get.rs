#![allow(clippy::comparison_chain)]

use std::collections::{BTreeMap, HashSet, HashMap};

use serde_json::Value;

use crate::helpers::{after_last};
use crate::my_types::*;
use crate::api_log;
use crate::my_err::{Result, MyErr};
use crate::ldap_wrapper::{LdapW, mono_attrs, LdapAttrs};
use crate::my_ldap::{dn_to_rdn_and_parent_dn, user_urls_, user_has_right_on_sgroup_filter};
use crate::my_ldap::{url_to_dn_};
use crate::my_ldap_check_rights::check_right_on_self_or_any_parents;
use crate::ldap_filter;

fn is_disjoint(vals: &[String], set: &HashSet<String>) -> bool {
    !vals.iter().any(|val| set.contains(val))
}

async fn user_urls(ldp: &mut LdapW<'_>) -> Result<LoggedUserUrls> {
    Ok(match ldp.logged_user {
        LoggedUser::TrustedAdmin => LoggedUserUrls::TrustedAdmin,
        LoggedUser::User(user) => LoggedUserUrls::User(user_urls_(ldp, user).await?)
    })
}

fn user_highest_right(sgroup_attrs: &mut LdapAttrs, user_urls: &HashSet<String>) -> Option<Right> {
    for right in Right::Reader.to_allowed_rights() {
        if let Some(urls) = sgroup_attrs.remove(&right.to_attr()) {
            if !is_disjoint(&urls, user_urls) {
                return Some(right)
            }
        }
    }
    None
}

impl SubjectSourceConfig {
    fn search_filter_(&self, term: &str) -> String {
        self.search_filter.replace("%TERM%", term).replace(" ", "")
    }
}

async fn get_subjects_from_same_branch(ldp: &mut LdapW<'_>, sscfg: &SubjectSourceConfig, base_dn: &str, rdns: &[&str], search_token: &Option<String>) -> Result<Subjects> {
    let rdns_filter = ldap_filter::or(rdns.iter().map(|rdn| ldap_filter::rdn(rdn)).collect());
    let filter = if let Some(term) = search_token {
        ldap_filter::and2(&rdns_filter,&sscfg.search_filter_(term))
    } else {
        rdns_filter
    };
    Ok(ldp.search_subjects(base_dn, &sscfg.display_attrs, dbg!(&filter), None).await?)
}

async fn get_subjects_from_urls(ldp: &mut LdapW<'_>, urls: Vec<String>) -> Result<Subjects> {
    get_subjects(ldp, urls.into_iter().filter_map(url_to_dn_).collect(), &None, &None).await
}

fn into_group_map<K: Eq + std::hash::Hash, V, I: Iterator<Item = (K, V)>>(iter: I) -> HashMap<K, Vec<V>> {
    iter.fold(HashMap::new(), |mut map, (k, v)| {
        map.entry(k).or_insert_with(|| Vec::new()).push(v);
        map
    })
}
async fn get_subjects(ldp: &mut LdapW<'_>, dns: Vec<String>, search_token: &Option<String>, sizelimit: &Option<usize>) -> Result<Subjects> {
    let mut r = BTreeMap::new();


    let parent_dn_to_rdns = into_group_map(dns.iter().filter_map(|dn| {
        let (rdn, parent_dn) = dn_to_rdn_and_parent_dn(dn)?;
        Some((parent_dn, rdn))
    }));
        
    for (parent_dn, rdns) in parent_dn_to_rdns {
        if let Some(sscfg) = ldp.config.dn_to_subject_source_cfg(parent_dn) {
            let mut count = 0;
            for rdns_ in rdns.chunks(10) {
                let subjects = &mut get_subjects_from_same_branch(ldp, sscfg, parent_dn, rdns_, search_token).await?;
                count += subjects.len();
                r.append(subjects);
                if let Some(limit) = sizelimit {
                    if count >= *limit { break; }
                }
            }
        }
    }

    Ok(r)
}

/*
pub fn to_rel_ou(parent_attrs: &MonoAttrs, mut attrs: MonoAttrs) -> MonoAttrs {
    // if inside stem "Applications", transform "Applications:Filex" into "Filex" 
    // TODO keep it only if "grouper" migration flag activated?
    if let (Some(parent_ou), Some(child_ou)) = (parent_attrs.get("ou"), attrs.get_mut("ou")) {
        if let Some(child_inner_ou) = child_ou.strip_prefix(parent_ou) {
            *child_ou = child_inner_ou.trim_start_matches(":").to_owned();
        }
    }
    attrs
}
*/

pub async fn get_children(ldp: &mut LdapW<'_>, id: &str) -> Result<SgroupsWithAttrs> {
    eprintln!("  get_children({})", id);
    let wanted_attrs = ldp.config.sgroup_attrs.keys().collect();
    let filter = ldap_filter::sgroup_children(id);
    let filter = ldap_filter::and2_if_some(&filter, &ldp.config.sgroup_filter);
    let children = ldp.search_sgroups(&filter, wanted_attrs, None).await?.filter_map(|e| {
        let child_id = ldp.config.dn_to_sgroup_id(&e.dn)?;
        // ignore grandchildren
        if ldp.config.stem.is_grandchild(id, &child_id) { return None }
        let attrs = simplify_hierachical_ou(mono_attrs(e.attrs));
        Some((child_id, attrs))
    }).collect();
    Ok(children)
}

// compute direct right, without taking into account right inheritance (inheritance is handled in "get_parents()")
async fn get_parents_raw(ldp: &mut LdapW<'_>, filter: &str, user_urls: &LoggedUserUrls, sizelimit: Option<i32>) -> Result<BTreeMap<String, SgroupOutAndRight>> {
    let display_attrs: Vec<&String> = ldp.config.sgroup_attrs.keys().collect();
    let direct_right_attrs = Right::Reader.to_allowed_attrs();
    let wanted_attrs = [ display_attrs, direct_right_attrs.iter().collect() ].concat();
    let groups = ldp.search_sgroups(filter, wanted_attrs, sizelimit).await?.filter_map(|mut e| {
        let right = match user_urls {
            LoggedUserUrls::TrustedAdmin => Some(Right::Admin),
            LoggedUserUrls::User(user_urls) => user_highest_right(&mut e.attrs, user_urls),
        };
        let id = ldp.config.dn_to_sgroup_id(&e.dn)?;
        // return the remaining attrs
        let attrs = to_sgroup_attrs(&id, e.attrs);
        Some((id.clone(), SgroupOutAndRight { attrs, right, sgroup_id: id }))
    }).collect();
    Ok(groups)
}
async fn get_parents(ldp: &mut LdapW<'_>, id: &str, user_urls: &LoggedUserUrls) -> Result<Vec<SgroupOutAndRight>> {
    let mut parents_id = ldp.config.stem.parent_stems(id);
    let filter = ldap_filter::or(parents_id.iter().map(|id| ldp.config.sgroup_filter(id)).collect());
    let mut parents = get_parents_raw(ldp, &filter, user_urls, None).await?;

    // convert to Vec using the order of parents_id + compute right (inheriting from parent)
    parents_id.reverse();

    let mut best = None;

    Ok(parents_id.into_iter().filter_map(|id| {
        let mut parent = parents.remove(id)?;
        if best < parent.right {
            best = parent.right;
        } else if parent.right < best {
            parent.right = best;
        }
        Some(parent)
    }).collect())
    /*
    let r = map_rev_with_preview(parents, |one, p_one| {
        match p_one {
            Some(p_one) => 
                SgroupOutAndRight { attrs: to_rel_ou(&p_one.attrs, one.attrs), ..one },
            None => one,
        }
    });
    */
}
async fn get_right_and_parents(ldp: &mut LdapW<'_>, id: &str, self_attrs: &mut LdapAttrs) -> Result<(Right, Vec<SgroupOutAndRight>)> {
    let user_urls = user_urls(ldp).await?;

    let self_right = match &user_urls {
        LoggedUserUrls::TrustedAdmin => Some(Right::Admin),
        LoggedUserUrls::User(user_urls) => user_highest_right(self_attrs, user_urls),
    };

    let parents = get_parents(ldp, id, &user_urls).await?;

    eprintln!("  best_right_on_self_or_any_parents({}) with user {:?}", id, ldp.logged_user);
    let mut best = self_right;
    for parent in &parents {
        if parent.right > best {
            best = parent.right;
        }
    }
    eprintln!("  best_right_on_self_or_any_parents({}) with user {:?} => {:?}", id, ldp.logged_user, best);
    let best = best.ok_or_else(|| MyErr::Msg(format!("not right to read sgroup {}", id)))?;
    Ok((best, parents))
}

pub async fn get_sgroup(cfg_and_lu: CfgAndLU<'_>, id: &str) -> Result<SgroupAndMoreOut> {
    eprintln!("get_sgroup({})", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;

    // we query all the attrs we need: attrs for direct_members + attrs to compute rights + attrs to return
    let wanted_attrs = [ 
        vec![ Mright::Member.to_attr() ],
        Right::Reader.to_allowed_attrs(),
        ldp.config.sgroup_attrs.keys().map(String::from).collect(),
    ].concat();
    if let Some(entry) = ldp.read_sgroup(id, wanted_attrs).await? {
        //eprintln!("      read sgroup {} => {:?}", id, entry);
        let is_stem = ldp.config.stem.is_stem(id);

        // use the 3 attrs kinds:
        let mut attrs = entry.attrs;
        // #1 direct members
        let direct_members = attrs.remove(&Mright::Member.to_attr());
        // #2 compute rights (also computing parents because both require user_urls)
        let (right, parents) = get_right_and_parents(ldp, id, &mut attrs).await?;
        // #3 pack the remaining attrs:
        let attrs = to_sgroup_attrs(id, attrs);

        let more = if is_stem { 
            let children = get_children(ldp, id).await?;
            SgroupOutMore::Stem { children }
        } else { 
            let direct_members = get_subjects_from_urls(ldp, direct_members.unwrap_or_default()).await?;
            SgroupOutMore::Group { direct_members }
        };
        Ok(SgroupAndMoreOut { attrs, right, more, parents })
    } else {
        Err(MyErr::Msg(format!("sgroup {} does not exist", id)))
    }
}

pub async fn get_sgroup_direct_rights(cfg_and_lu: CfgAndLU<'_>, id: &str) -> Result<BTreeMap<Right, Subjects>> {
    eprintln!("get_sgroup_direct_rights({})", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;

    if let Some(group) = ldp.read_sgroup(id, Right::Reader.to_allowed_attrs()).await? {
        let mut attrs = group.attrs;
        let mut r = btreemap![];
        for right in Right::Reader.to_allowed_rights() {
            if let Some(urls) = attrs.remove(&right.to_attr()) {
                let subjects = get_subjects_from_urls(ldp, urls).await?;
                r.insert(right, subjects);
            }
        }
        Ok(r)
    } else {
        Err(MyErr::Msg(format!("sgroup {} does not exist", id)))
    }
}

// sizelimit is applied for each subject source, so the max number of results is sizelimit * nb_subject_sources
pub async fn get_group_flattened_mright(cfg_and_lu: CfgAndLU<'_>, id: &str, mright: Mright, search_token: Option<String>, sizelimit: Option<usize>) -> Result<SubjectsAndCount> {
    eprintln!("get_group_flattened_mright({})", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    if cfg_and_lu.cfg.ldap.stem.is_stem(id) {
        return Err(MyErr::Msg("get_group_flattened_mright works only on groups, not stems".to_owned()))
    }

    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;

    let flattened_dns = {
        let dn = ldp.config.sgroup_id_to_dn(id);
        ldp.read_flattened_mright(&dn, mright).await?
    };
    let count = flattened_dns.len();
    let subjects = get_subjects(ldp, flattened_dns, &search_token, &sizelimit).await?;
    Ok(SubjectsAndCount { count, subjects })
}

/*
pub async fn group_uses(cfg_and_lu: CfgAndLU<'_>, id: &str) -> Result<SgroupsWithAttrs> {
    eprintln!("group_uses({})", id);
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;

    let group_filter = 
    
    search_sgroups_with_attrs(ldp, &group_filter, Some(sizelimit)).await
}
*/

pub async fn search_subjects(cfg_and_lu: CfgAndLU<'_>, search_token: String, sizelimit: i32, source_dn: Option<String>) -> Result<BTreeMap<&String, Subjects>> {
    eprintln!("search_subjects({}, {:?})", search_token, source_dn);
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    let mut r = btreemap![];
    for sscfg in &cfg_and_lu.cfg.ldap.subject_sources {
        match &source_dn {
            Some(dn) if *dn != sscfg.dn => {},
            _ => {
                let filter = sscfg.search_filter_(&search_token);
                r.insert(&sscfg.dn, ldp.search_subjects(&sscfg.dn, &sscfg.display_attrs, dbg!(&filter), Some(sizelimit)).await?);
            },
        }
    }
    Ok(r)
}

async fn search_sgroups_with_attrs(ldp: &mut LdapW<'_>, filter: &str, sizelimit: Option<i32>) -> Result<SgroupsWithAttrs> {
    let wanted_attrs = ldp.config.sgroup_attrs.keys().collect();
    let groups = ldp.search_sgroups(filter, wanted_attrs, sizelimit).await?.filter_map(|e| {
        let id = ldp.config.dn_to_sgroup_id(&e.dn)?;
        let attrs = mono_attrs(e.attrs);
        Some((id, attrs))
    }).collect();
    Ok(groups)
}

fn simplify_hierachical_ou(mut attrs: MonoAttrs) -> MonoAttrs {
    if let Some(ou) = attrs.get_mut("ou") {
        if let Some(ou_) = after_last(ou, ":") {
            *ou = ou_.to_owned();
        }
    }
    attrs
}

fn to_sgroup_attrs(id: &str, attrs: LdapAttrs) -> MonoAttrs {
    let mut attrs = mono_attrs(attrs);
    if id.is_empty() {
        // TODO, move this in conf?
        attrs.insert("ou".to_owned(), "Racine".to_owned());
    } else {
        attrs = simplify_hierachical_ou(attrs)
    }
    attrs
}

// returns groups user has DIRECT right update|admin
// (inherited rights via stems are not taken into account)
pub async fn mygroups(cfg_and_lu: CfgAndLU<'_>) -> Result<SgroupsWithAttrs> {
    eprintln!("mygroups()");
    match &cfg_and_lu.user {
        LoggedUser::TrustedAdmin => Err(MyErr::Msg("mygroups need a real user".to_owned())),
        LoggedUser::User(user) => {
            let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
            let filter = ldp.config.user_has_direct_right_on_group_filter(&ldp.config.people_id_to_dn(user), &Right::Updater);
            search_sgroups_with_attrs(ldp, &filter, None).await
        },
    }
}

// example of filter used: (| (memberURL;x-admin=uid=prigaux,...) (memberURL;x-admin=cn=collab.foo,...) (memberURL;x-update=uid=prigaux,...) (memberURL;x-update=cn=collab.foo,...) )
async fn get_all_stems_id_with_user_right(ldp: &mut LdapW<'_>, user: &str, right: Right) -> Result<HashSet<String>> {
    let user_urls = user_urls_(ldp, user).await?;
    let stems_with_right_filter = ldap_filter::and2(
        &ldp.config.stem.filter,
        &user_has_right_on_sgroup_filter(&user_urls, &right),
    );
    let stems_id = ldp.search_sgroups_id(&stems_with_right_filter).await?;
    Ok(stems_id)
}

pub async fn search_sgroups(cfg_and_lu: CfgAndLU<'_>, right: Right, search_token: String, sizelimit: i32) -> Result<SgroupsWithAttrs> {
    eprintln!("search_sgroups({}, {:?})", search_token, right);
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;

    let term_filter = ldp.config.sgroup_sscfg().search_filter_(&search_token);

    let group_filter = match &cfg_and_lu.user {
        LoggedUser::TrustedAdmin => term_filter,
        LoggedUser::User(user) => {

            // from direct rights
            // example: (|(supannGroupeLecteurDN=uid=prigaux,...)(supannGroupeLecteurDN=uid=owner,...))
            let user_direct_allowed_groups_filter = 
                ldp.config.user_has_direct_right_on_group_filter(&ldp.config.people_id_to_dn(user), &right);

            // from inherited rights
            // example: (|(cn=a.*)(cn=b.bb.*)) if user has right on stems "a."" and "b.bb." 
            let children_of_allowed_stems_filter = {
                // TODO: cache !?
                let stems_id_with_right = get_all_stems_id_with_user_right(ldp, user, right).await?;
                // TODO: simplify: no need to keep "a." and "a.b."
                ldap_filter::or(
                    dbg!(stems_id_with_right).into_iter().map(|stem_id| ldap_filter::sgroup_self_and_children(&stem_id)).collect()
                )
            };

            let right_filter = ldap_filter::or(vec![
                user_direct_allowed_groups_filter, 
                children_of_allowed_stems_filter,
            ]);
            ldap_filter::and2_if_some(
                &ldap_filter::and2(&right_filter, &term_filter),
                &ldp.config.sgroup_filter).into_owned()
        },
    };
    search_sgroups_with_attrs(ldp, &group_filter, Some(sizelimit)).await
}

pub async fn get_sgroup_logs(cfg_and_lu: CfgAndLU<'_>, id: &str, bytes: i64) -> Result<Value> {
    eprintln!("get_sgroup_logs({}, {:?})", id, bytes);   
    cfg_and_lu.cfg.ldap.stem.validate_sgroup_id(id)?;

    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    check_right_on_self_or_any_parents(ldp, id, Right::Admin).await?;

    api_log::get_sgroup_logs(&cfg_and_lu.cfg.log_dir, id, bytes).await
}
