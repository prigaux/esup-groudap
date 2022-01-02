use std::collections::{HashSet};
use ldap3::{Scope, LdapConnAsync, SearchEntry, SearchOptions, Ldap, Mod, ldap_escape};
use ldap3::result::{Result, LdapResult, LdapError};
type LdapAttrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use super::my_types::{Attrs, GroupKind, MyMods, MyMod, Right, LdapConfig};

pub struct LdapW<'a> {
    pub ldap: Ldap,
    pub config: &'a LdapConfig,
}

pub async fn open<'a>(config: &'a LdapConfig) -> Result<LdapW<'a>> {
    let (conn, mut ldap) = LdapConnAsync::new(&config.url).await?;
    ldap3::drive!(conn);
    ldap.simple_bind(&config.bind_dn, &config.bind_password).await?;
    Ok(LdapW { ldap, config })
}


fn to_ldap_mods(mods : MyMods) -> Vec<Mod<String>> {
    let mut r = vec![];
    for (right, submods) in mods {
        let attr = format!("memberURL;x-{}", right.to_string());
        for (action, list) in submods {
            let mod_ = match action { MyMod::ADD => Mod::Add, MyMod::DELETE => Mod::Delete, MyMod::REPLACE => Mod::Replace };
            r.push(mod_(attr.to_string(), list));
        }
    }
    r
}

fn group_id_to_dn(config: &LdapConfig, cn: &str) -> String {
    format!("cn={},{}", cn, config.groups_dn)
}
pub fn people_id_to_dn(config: &LdapConfig, cn: &str) -> String {
    format!("uid={},ou=people,{}", cn, config.base_dn)
}
pub fn dn_to_url(dn: &str) -> String {
    format!("ldap:///{}", dn)
}

// helper function
pub async fn _read(ldp: &mut LdapW<'_>, dn: &str, attrs: Vec<&str>) -> Result<Option<SearchEntry>> {
    let (mut rs, _res) = ldp.ldap.search(dn, Scope::Base, "(objectClass=*)", attrs).await?.success()?;
    Ok(rs.pop().map(SearchEntry::construct))
}

// helper function
pub async fn is_dn_matching_filter(ldp: &mut LdapW<'_>, dn: &str, filter: &str) -> Result<bool> {
    let (rs, _res) = ldp.ldap.search(dn, Scope::Base, filter, vec![""]).await?.success()?;
    Ok(!rs.is_empty())
}

// helper function
pub async fn group_exists(ldp: &mut LdapW<'_>, filter: &str) -> Result<bool> {
    let opts = SearchOptions::new().sizelimit(1);
    let ldap_ = ldp.ldap.with_search_options(opts);
    let (rs, _res) = ldap_.search(&ldp.config.groups_dn, Scope::Subtree, filter, vec![""]).await?.success()?;
    Ok(!rs.is_empty())
}

// wow, it is complex...
fn to_hashset_ref(elts : &HashSet<String>) -> HashSet<&str> {
    let mut set: HashSet<&str> = HashSet::new();
    for e in elts { set.insert(&e); }
    set
}

pub async fn ldap_add_group(ldp: &mut LdapW<'_>, kind: GroupKind, cn: &str, attrs: LdapAttrs<'_>) -> Result<LdapResult> {
    let object_classes = match kind {
        GroupKind::GROUP => &ldp.config.group_object_classes,
        _ => &ldp.config.stem_object_classes,
    };
    let base_attrs = vec![
        ("objectClass", to_hashset_ref(object_classes)),
        ("cn", hashset!{cn}),
    ];
    let member_attr = match kind {
        GroupKind::GROUP => vec![("member", hashset!{""})],  // "member" is requested...
        _ => vec![],
    };
    let all_attrs = [ base_attrs, attrs, member_attr ].concat();
    ldp.ldap.add(&group_id_to_dn(&ldp.config, cn), all_attrs).await
}

pub async fn create(ldp: &mut LdapW<'_>, kind: GroupKind, id: &str, attrs: Attrs) -> Result<LdapResult> {
    let attrs = attrs.iter().map(|(name, value)|
        (name.to_string(), hashset![&value as &str])
    ).collect();
    ldap_add_group(ldp, kind, id, attrs).await
}

pub async fn delete(ldp: &mut LdapW<'_>, id: &str) -> Result<LdapResult> {
    if group_exists(ldp, &format!("(cn={}.*)", ldap_escape(id))).await? { 
        return Err(LdapError::AdapterInit("can not remove stem with existing children".to_string()))
    }
    ldp.ldap.delete(&group_id_to_dn(&ldp.config, id)).await
}

fn _vec_contains(vec : &Vec<String>, x: &str) -> bool {
    vec.iter().any(|e| e == x)
}

async fn is_stem(ldp: &mut LdapW<'_>, id: &str) -> Result<bool> {
    is_dn_matching_filter(ldp, &group_id_to_dn(&ldp.config, id), "(objectClass=groupOfNames)").await
}

pub async fn modify_direct_members_or_rights(ldp: &mut LdapW<'_>, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    if is_stem(ldp, id).await? {
        if my_mods.contains_key(&Right::MEMBER) { return Err(LdapError::AdapterInit("MEMBER not allowed for stems".to_string())) }
    }
    let mods = to_ldap_mods(my_mods);
    ldp.ldap.modify(&group_id_to_dn(&ldp.config, id), mods).await
}

