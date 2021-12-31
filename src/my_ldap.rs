use std::collections::{BTreeMap, HashSet};
use ldap3::{Scope, SearchEntry, SearchOptions, Ldap, Mod};
use ldap3::result::{Result, LdapResult};
type Attrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use rocket::serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Right { MEMBER, READER, UPDATER, ADMIN }
#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum MyMod { ADD, DELETE, REPLACE }
pub type MyMods = BTreeMap<Right, BTreeMap<MyMod, HashSet<String>>>;


impl Right {
    fn to_string(&self) -> &'static str {
        match self {
            Self::MEMBER => "member",
            Self::READER => "reader",
            Self::UPDATER => "updater",
            Self::ADMIN => "admin",
        }
    }
}

struct Group<'a> {
    id: &'a str,
    ou: &'a str,
    description: &'a str,
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

async fn ldap_add_ou_branch(ldap: &mut Ldap, ou: &str) -> Result<LdapResult> {
    let dn = format!("ou={},dc=nodomain", ou);
    ldap.add(&dn, vec![
        ("objectClass", hashset!{"organizationalUnit"}),
        ("ou", hashset!{ou}),
    ]).await
}

async fn ldap_add_people(ldap: &mut Ldap, uid: &str, attrs: Attrs<'_>) -> Result<LdapResult> {
    let dn = format!("uid={},ou=people,dc=nodomain", uid);
    let all_attrs = [ attrs, vec![
        ("objectClass", hashset!{"inetOrgPerson", "shadowAccount"}),
        ("uid", hashset!{uid}),
    ] ].concat();
    ldap.add(&dn, all_attrs).await
}

fn group_id_to_dn(cn: &str) -> String {
    format!("cn={},ou=groups,dc=nodomain", cn)
}

async fn ldap_add_group(ldap: &mut Ldap, cn: &str, attrs: Attrs<'_>) -> Result<LdapResult> {
    let all_attrs = [ attrs, vec![
        ("objectClass", hashset!{"groupOfNames", "up1SyncGroup"}),
        ("cn", hashset!{cn}),
        ("member", hashset!{""}),
    ] ].concat();
    ldap.add(&group_id_to_dn(cn), all_attrs).await
}

async fn add_group(ldap: &mut Ldap, group: Group<'_>) -> Result<LdapResult> {
    ldap_add_group(ldap, &group.id, vec![
        ("ou", hashset!{group.ou}),
        ("description", hashset!{group.description}),
    ]).await
}

pub async fn modify_members_or_rights(ldap: &mut Ldap, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    let mods = to_ldap_mods(my_mods);
    ldap.modify(&group_id_to_dn(id), mods).await
}

pub async fn set_test_data(ldap : &mut Ldap) -> Result<LdapResult> {
    let _res = ldap.delete("uid=prigaux,ou=people,dc=nodomain").await;
    let _res = ldap.delete("uid=prigaux2,ou=people,dc=nodomain").await;
    let _res = ldap.delete("ou=people,dc=nodomain").await;
    let _res = ldap.delete("cn=foo,ou=groups,dc=nodomain").await;
    let _res = ldap.delete("ou=groups,dc=nodomain").await;
    let _res = ldap.delete("dc=nodomain").await;

    ldap.add("dc=nodomain", vec![
        ("objectClass", hashset!{"dcObject", "organization"}),
        ("dc", hashset!{"nodomain"}),
        ("o", hashset!{"nodomain"}),
    ]).await?;
    ldap_add_ou_branch(ldap, "people").await?;
    ldap_add_ou_branch(ldap, "groups").await?;
    ldap_add_people(ldap, "prigaux", vec![
        ("cn", hashset!{"Rigaux Pascal"}),
        ("displayName", hashset!{"Pascal Rigaux"}),
        ("sn", hashset!{"Rigaux"}),
    ]).await?;

    add_group(ldap, Group { id: "foo", ou: "Foo group", description: "Foo group" }).await?;
    
    let res = modify_members_or_rights(ldap, "foo", btreemap!{
        Right::UPDATER => btreemap!{ MyMod::ADD => hashset!["https://rigaux.org".to_string()] }
    }).await?;

    Ok(res)
}

pub async fn _test_search(ldap: &mut Ldap) -> Result<String> {
    let opts = SearchOptions::new().sizelimit(1);
    let (mut rs, _res) = ldap.with_search_options(opts).search("dc=nodomain", Scope::Subtree, "(objectClass=person)", vec!["displayName"]).await?.success()?;
    let dn = if let Some(entry) = rs.pop() { SearchEntry::construct(entry).dn } else { "????".to_string() };
    Ok(dn)
}
