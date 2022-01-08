use std::collections::{BTreeMap, HashSet};
use rocket::serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct CasConfig {
    pub prefix_url: String,
}
fn default_separator() -> String { ".".to_owned() }
fn default_root_id() -> String { "".to_owned() }
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
    pub stem_object_class: String,
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

#[derive(Deserialize, PartialEq, Eq, PartialOrd, Ord, Clone, Copy, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Mright { MEMBER, READER, UPDATER, ADMIN }

#[derive(Serialize, PartialEq, Eq, PartialOrd, Ord, Debug, Copy, Clone)]
pub enum Right { READER, UPDATER, ADMIN }

#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord, Copy, Clone)]
#[serde(rename_all = "lowercase")]
pub enum MyMod { ADD, DELETE, REPLACE }

pub type MyMods = BTreeMap<Mright, BTreeMap<MyMod, HashSet<String>>>;


#[derive(PartialEq, Eq, Deserialize, Serialize, Copy, Clone, Debug)]
pub enum GroupKind { GROUP, STEM }

#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord, Copy, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Attr { Ou, Description }
pub type Attrs = BTreeMap<Attr, String>;

#[derive(Serialize, PartialEq, Eq, Debug)]
pub struct SgroupOut {
    #[serde(flatten)]
    pub attrs: Attrs,
    pub kind: GroupKind,
}

#[derive(Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum SgroupOutMore {
    Stem { children: BTreeMap<String, Attrs> },
    Group { direct_members: BTreeMap<String, Attrs> },
}

#[derive(Serialize, PartialEq, Eq, Debug)]
pub struct SgroupAndMoreOut {
    #[serde(flatten)]
    pub attrs: Attrs,
    #[serde(flatten)]
    pub more: SgroupOutMore,

    pub right: Right,
}


const ATTR_LIST: [Attr; 2] = [Attr::Ou, Attr::Description];
impl Attr {
    pub fn to_string(&self) -> &'static str {
        match self {
            Self::Ou => "ou",
            Self::Description => "description",
        }
    }
    pub fn from_string(attr: &str) -> Option<Self> {
        match attr {
            "ou" => Some(Self::Ou),
            "description" => Some(Self::Description),
            _ => None,
        }
    }
    pub fn list<'a>() -> std::slice::Iter<'a, Attr> { ATTR_LIST.iter() }
    pub fn list_as_string() -> Vec<&'static str> {
        Self::list().map(|attr| attr.to_string()).collect()
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
    pub fn list() -> Vec<Self> { vec![Self::MEMBER, Self::READER, Self::UPDATER, Self::ADMIN] }  
    pub fn to_flattened_attr(&self) -> &'static str {
        match self {
            Self::MEMBER => "member",
            Self::READER => "supannGroupeLecteurDN",
            Self::UPDATER => "supannGroupeAdminDN",
            Self::ADMIN => "owner",
        }
    }
    
}
impl Right {
    // NB: best right first
    pub fn to_allowed_rights(&self) -> Vec<Self> {
        match self {
            Self::READER => vec![Self::ADMIN, Self::UPDATER, Self::READER],
            Self::UPDATER => vec![Self::ADMIN, Self::UPDATER],
            Self::ADMIN => vec![Self::ADMIN],
        }
    }
    pub fn to_allowed_attrs(&self) -> Vec<String> {
        self.to_allowed_rights().iter().map(|r| r.to_attr()).collect()        
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
    /*
    pub fn to_flattened_attr(&self) -> &'static str {
        self.to_mright().to_flattened_attr()
    }
    */
}

#[derive(Debug)]
pub enum LoggedUser {
    TrustedAdmin,
    User(String),
}

pub struct CfgAndLU<'a> {
    pub cfg: &'a Config,
    pub user: LoggedUser,
}
