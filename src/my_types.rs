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
pub enum Mright { MEMBER, READER, UPDATER, ADMIN }

pub enum Right { READER, UPDATER, ADMIN }

#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum MyMod { ADD, DELETE, REPLACE }

pub type MyMods = BTreeMap<Mright, BTreeMap<MyMod, HashSet<String>>>;


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

impl Mright {
    fn to_string(&self) -> &'static str {
        match self {
            Self::MEMBER => "member",
            Self::READER => "reader",
            Self::UPDATER => "updater",
            Self::ADMIN => "admin",
        }
    }
    pub fn to_attr(&self) -> String {
        format!("memberURL;x-{}", self.to_string())
    }
    pub fn to_indirect_attr(&self) -> &'static str {
        match self {
            Self::MEMBER => "member",
            Self::READER => "supannGroupeLecteurDN",
            Self::UPDATER => "supannGroupeAdminDN",
            Self::ADMIN => "owner",
        }
    }
}
impl Right {
    pub fn to_allowed_rights(&self) -> Vec<Self> {
        match self {
            Self::READER => vec![Self::READER, Self::UPDATER, Self::ADMIN],
            Self::UPDATER => vec![Self::UPDATER, Self::ADMIN],
            Self::ADMIN => vec![Self::ADMIN],
        }
    }
    pub fn to_mright(&self) -> Mright {
        match self {
            Self::READER => Mright::READER,
            Self::UPDATER => Mright::UPDATER,
            Self::ADMIN => Mright::ADMIN,
        }
    }
    pub fn to_attr(&self) -> String {
        self.to_mright().to_attr()
    }
    pub fn to_indirect_attr(&self) -> &'static str {
        self.to_mright().to_indirect_attr()
    }
}

#[derive(Debug)]
pub enum LoggedUser {
    TrustedAdmin,
    User(String),
}
