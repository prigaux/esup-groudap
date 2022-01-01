use std::collections::{BTreeMap, HashSet};
use ldap3::{Ldap, Mod};
use ldap3::result::{Result, LdapResult};
type LdapAttrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use rocket::serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Right { MEMBER, READER, UPDATER, ADMIN }
#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum MyMod { ADD, DELETE, REPLACE }
pub type MyMods = BTreeMap<Right, BTreeMap<MyMod, HashSet<String>>>;

#[derive(PartialEq, Eq, Deserialize, Serialize)]
pub enum GroupKind { GROUP, STEM }

#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Attr { Ou, Description }
pub type Attrs = BTreeMap<Attr, String>;

impl Attr {
    fn to_string(&self) -> &'static str {
        match self {
            Self::Ou => "ou",
            Self::Description => "description",
        }
    }
}

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

pub struct Group {
    pub id: String,
    pub ou: String,
    pub description: String,
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

fn group_id_to_dn(cn: &str) -> String {
    format!("cn={},ou=groups,dc=nodomain", cn)
}

pub async fn ldap_add_group(ldap: &mut Ldap, kind: GroupKind, cn: &str, attrs: LdapAttrs<'_>) -> Result<LdapResult> {
    let struct_class = if kind == GroupKind::GROUP { "groupOfNames" } else { "organizationalRole" };
    let all_attrs = [ 
        vec![
            ("objectClass", hashset!{struct_class, "up1SyncGroup"}),
            ("cn", hashset!{cn}),
        ], 
        attrs, 
        if kind == GroupKind::GROUP { 
            vec![("member", hashset!{""})] 
        } else { 
            vec![]
        },
    ].concat();
    ldap.add(&group_id_to_dn(cn), all_attrs).await
}

pub async fn create(ldap: &mut Ldap, kind: GroupKind, id: &str, attrs: Attrs) -> Result<LdapResult> {
    let attrs_ = attrs.iter().map(|(name, value)|
        (name.to_string(), hashset![&value as &str])
    ).collect();
    ldap_add_group(ldap, kind, id, attrs_).await
}

pub async fn add_group(ldap: &mut Ldap, group: Group) -> Result<LdapResult> {
    let attrs = btreemap![ Attr::Ou => group.ou, Attr::Description => group.description ];
    create(ldap, GroupKind::GROUP, &group.id, attrs).await
}

pub async fn modify_members_or_rights(ldap: &mut Ldap, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    let mods = to_ldap_mods(my_mods);
    ldap.modify(&group_id_to_dn(id), mods).await
}

