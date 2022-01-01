use std::collections::{HashSet};
use ldap3::{Scope, SearchEntry, SearchOptions, Ldap, Mod, ldap_escape};
use ldap3::result::{Result, LdapResult, LdapError};
type LdapAttrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use super::my_types::{Attrs, GroupKind, MyMods, MyMod, Right};


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

#[allow(non_upper_case_globals)]
const groups_dn: &str = "ou=groups,dc=nodomain";
#[allow(non_upper_case_globals)]
const people_dn: &str = "ou=people,dc=nodomain";

fn group_id_to_dn(cn: &str) -> String {
    format!("cn={},{}", cn, groups_dn)
}
pub fn people_id_to_dn(cn: &str) -> String {
    format!("uid={},{}", cn, people_dn)
}
pub fn dn_to_url(dn: &str) -> String {
    format!("ldap:///{}", dn)
}

// helper function
pub async fn _read(ldap: &mut Ldap, dn: &str, attrs: Vec<&str>) -> Result<Option<SearchEntry>> {
    let (mut rs, _res) = ldap.search(dn, Scope::Base, "(objectClass=*)", attrs).await?.success()?;
    Ok(rs.pop().map(SearchEntry::construct))
}

// helper function
pub async fn is_dn_matching_filter(ldap: &mut Ldap, dn: &str, filter: &str) -> Result<bool> {
    let (rs, _res) = ldap.search(dn, Scope::Base, filter, vec![""]).await?.success()?;
    Ok(!rs.is_empty())
}

// helper function
pub async fn group_exists(ldap: &mut Ldap, filter: &str) -> Result<bool> {
    let opts = SearchOptions::new().sizelimit(1);
    let ldap = ldap.with_search_options(opts);
    let (rs, _res) = ldap.search(groups_dn, Scope::Subtree, filter, vec![""]).await?.success()?;
    Ok(!rs.is_empty())
}

pub async fn ldap_add_group(ldap: &mut Ldap, kind: GroupKind, cn: &str, attrs: LdapAttrs<'_>) -> Result<LdapResult> {
    let struct_class = match kind {
        GroupKind::GROUP => "groupOfNames",
        _ => "organizationalRole",
    };
    let base_attrs = vec![
        ("objectClass", hashset!{struct_class, "supannGroupe", "up1SyncGroup"}),
        ("cn", hashset!{cn}),
    ];
    let member_attr = match kind {
        GroupKind::GROUP => vec![("member", hashset!{""})],  // "member" is requested...
        _ => vec![],
    };
    let all_attrs = [ base_attrs, attrs, member_attr ].concat();
    ldap.add(&group_id_to_dn(cn), all_attrs).await
}

pub async fn create(ldap: &mut Ldap, kind: GroupKind, id: &str, attrs: Attrs) -> Result<LdapResult> {
    let attrs = attrs.iter().map(|(name, value)|
        (name.to_string(), hashset![&value as &str])
    ).collect();
    ldap_add_group(ldap, kind, id, attrs).await
}

pub async fn delete(ldap: &mut Ldap, id: &str) -> Result<LdapResult> {
    if group_exists(ldap, &format!("(cn={}.*)", ldap_escape(id))).await? { 
        return Err(LdapError::AdapterInit("can not remove stem with existing children".to_string()))
    }
    ldap.delete(&group_id_to_dn(id)).await
}

fn _vec_contains(vec : &Vec<String>, x: &str) -> bool {
    vec.iter().any(|e| e == x)
}

async fn is_stem(ldap: &mut Ldap, id: &str) -> Result<bool> {
    is_dn_matching_filter(ldap, &group_id_to_dn(id), "(objectClass=groupOfNames)").await
}

pub async fn modify_direct_members_or_rights(ldap: &mut Ldap, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    if is_stem(ldap, id).await? {
        if my_mods.contains_key(&Right::MEMBER) { return Err(LdapError::AdapterInit("MEMBER not allowed for stems".to_string())) }
    }
    let mods = to_ldap_mods(my_mods);
    ldap.modify(&group_id_to_dn(id), mods).await
}

