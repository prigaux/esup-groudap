use std::collections::{BTreeMap, HashSet};
use rocket::serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct CasConfig {
    pub prefix_url: String,
}
fn default_separator() -> String { ".".to_owned() }
fn default_root_id() -> String { "ROOT".to_owned() }
#[derive(Deserialize)]
pub struct StemConfig {
    #[serde(default = "default_separator")]
    pub separator: String,
    #[serde(default = "default_root_id")]
    pub root_id: String,
}
#[derive(Deserialize)]
pub struct LdapConfig {
    pub url: String,
    pub bind_dn: String,
    pub bind_password: String,
    pub base_dn: String,
    pub groups_dn: String,
    pub stem_object_classes: HashSet<String>,
    pub group_object_classes: HashSet<String>,
    pub stem: StemConfig,
}
#[derive(Deserialize)]
pub struct Config {
    pub trusted_auth_bearer: Option<String>,
    pub cas: CasConfig,
    pub ldap: LdapConfig,
}

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
    pub fn to_string(&self) -> &'static str {
        match self {
            Self::Ou => "ou",
            Self::Description => "description",
        }
    }
}

impl Right {
    pub fn to_string(&self) -> &'static str {
        match self {
            Self::MEMBER => "member",
            Self::READER => "reader",
            Self::UPDATER => "updater",
            Self::ADMIN => "admin",
        }
    }
}

#[derive(Debug)]
pub enum LoggedUser {
    TrustedAdmin,
    User(String),
}
