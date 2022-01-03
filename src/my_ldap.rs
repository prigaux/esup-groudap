use std::collections::{HashSet};
use ldap3::{Scope, SearchEntry, Mod};
use ldap3::result::{Result, LdapResult, LdapError};
type LdapAttrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use super::ldap_wrapper::{self, LdapW};
use super::my_types::*;
use super::ldap_filter;

fn to_ldap_mods(mods : MyMods) -> Vec<Mod<String>> {
    let mut r = vec![];
    for (right, submods) in mods {
        let attr = right.to_attr();
        for (action, list) in submods {
            let mod_ = match action { MyMod::ADD => Mod::Add, MyMod::DELETE => Mod::Delete, MyMod::REPLACE => Mod::Replace };
            r.push(mod_(attr.to_string(), list));
        }
    }
    r
}

// ("a.b.c", ".") => Some("a.b")
// ("a", ".") => None
fn rbefore<'a>(s: &'a str, end: &'a str) -> Option<&'a str> {
    Some(&s[..s.rfind(end)?])
}

// "a.b.c" => Some("a.b")
// "a" => Some("ROOT")
// "ROOT" => None
pub fn parent_stem<'a>(config: &'a StemConfig, id: &'a str) -> Option<&'a str> {
    rbefore(id, &config.separator).or_else(|| if id == config.root_id { None } else { Some(&config.root_id) })
}

// "a.b.c" => ["a.b", "a", "ROOT"]
pub fn parent_stems<'a>(config: &'a StemConfig, id: &'a str) -> Vec<&'a str> {
    let mut stems : Vec<&str> = Vec::new();
    while let Some(id) = parent_stem(config, id) {
        stems.push(id);
    }
    return stems;
}

pub fn sgroup_id_to_dn(config: &LdapConfig, cn: &str) -> String {
    format!("cn={},{}", cn, config.groups_dn)
}
pub fn people_id_to_dn(config: &LdapConfig, cn: &str) -> String {
    format!("uid={},ou=people,{}", cn, config.base_dn)
}
pub fn dn_to_url(dn: &str) -> String {
    format!("ldap:///{}", dn)
}


pub async fn is_sgroup_matching_filter(ldp: &mut LdapW<'_>, id: &str, filter: &str) -> Result<bool> {
    ldap_wrapper::is_dn_matching_filter(ldp, &sgroup_id_to_dn(&ldp.config, id), filter).await
}

pub async fn is_sgroup_existing(ldp: &mut LdapW<'_>, id: &str) -> Result<bool> {
    is_sgroup_matching_filter(ldp, id, ldap_filter::true_()).await
}

pub async fn is_stem(ldp: &mut LdapW<'_>, id: &str) -> Result<bool> {
    is_sgroup_matching_filter(ldp, id, ldap_filter::stem()).await
}


// wow, it is complex...
fn hashset_as_deref(elts : &HashSet<String>) -> HashSet<&str> {
    let mut set: HashSet<&str> = HashSet::new();
    for e in elts { set.insert(&e); }
    set
}

pub async fn ldap_add_group(ldp: &mut LdapW<'_>, kind: GroupKind, cn: &str, attrs: LdapAttrs<'_>) -> Result<LdapResult> {
    let base_attrs = {
        let object_classes = match kind {
            GroupKind::GROUP => &ldp.config.group_object_classes,
            _ => &ldp.config.stem_object_classes,
        };
        vec![
            ("objectClass", hashset_as_deref(object_classes)),
            ("cn", hashset!{cn}),
        ]
    };
    let member_attr = match kind {
        GroupKind::GROUP => vec![("member", hashset!{""})],  // "member" is requested...
        _ => vec![],
    };
    let all_attrs = [ base_attrs, attrs, member_attr ].concat();
    ldp.ldap.add(&sgroup_id_to_dn(&ldp.config, cn), all_attrs).await
}

// re-format: vector of (string key, hashset value)
fn to_ldap_attrs<'a>(attrs: &'a Attrs) -> LdapAttrs<'a> {
    attrs.iter().map(|(name, value)|
        (name.to_string(), hashset![&value as &str])
    ).collect()
}

pub async fn create(ldp: &mut LdapW<'_>, kind: GroupKind, id: &str, attrs: Attrs) -> Result<LdapResult> {    
    ldap_add_group(ldp, kind, id, to_ldap_attrs(&attrs)).await
}

pub async fn delete(ldp: &mut LdapW<'_>, id: &str) -> Result<LdapResult> {
    ldp.ldap.delete(&sgroup_id_to_dn(&ldp.config, id)).await
}

fn _vec_contains(vec : &Vec<String>, x: &str) -> bool {
    vec.iter().any(|e| e == x)
}

pub async fn modify_direct_members_or_rights(ldp: &mut LdapW<'_>, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    if is_stem(ldp, id).await? && my_mods.contains_key(&Mright::MEMBER) { 
        Err(LdapError::AdapterInit("MEMBER not allowed for stems".to_owned()))
    } else {
        let mods = to_ldap_mods(my_mods);
        ldp.ldap.modify(&sgroup_id_to_dn(&ldp.config, id), mods).await
    }
}

pub async fn user_groups(ldp: &mut LdapW<'_>, user_dn: &str) -> Result<HashSet<String>> {
    let (rs, _res) = {
        let filter = ldap_filter::member(user_dn);
        ldp.ldap.search(&ldp.config.groups_dn, Scope::Subtree, &filter, vec![""]).await?.success()?
    };
    Ok(rs.into_iter().map(|r| SearchEntry::construct(r).dn).collect())
}