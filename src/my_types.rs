use std::collections::{BTreeMap, HashSet};
use rocket::serde;
use rocket::serde::{Deserialize, Serialize, de};

use crate::systemd_calendar_events;

#[derive(Deserialize)]
pub struct CasConfig {
    pub prefix_url: String,
}
fn default_separator() -> String { ".".to_owned() }
fn default_root_id() -> String { "".to_owned() }

fn remotes_periodicity_checker<'de, D>(d: D) -> Result<BTreeMap<String, RemoteConfig>, D::Error>
    where D: de::Deserializer<'de>
{
    let remotes : BTreeMap<String, RemoteConfig> = BTreeMap::deserialize(d)?;
    
    if let Err(_) = systemd_calendar_events::next_elapse(
            remotes.values().map(|cfg| &cfg.periodicity).collect()
        ) {
        // there has been an error, retry one by one to know which one failed
        for (remote_id, cfg) in &remotes {
            if let Err(_) = systemd_calendar_events::next_elapse(vec![&cfg.periodicity]) {
                let msg = format!("a valid periodicity for remote {}. Hint: validate it with ''systemd-analyze calendar ....''", remote_id);
                return Err(de::Error::invalid_value(de::Unexpected::Str(cfg.periodicity.as_str()), &msg.as_str()));
            }
        }
    }
    Ok(remotes)
}

#[derive(Deserialize)]
pub struct StemConfig {
    #[serde(default = "default_separator")]
    pub separator: String,
    #[serde(default = "default_root_id")]
    pub root_id: String,
}

#[derive(Deserialize, Serialize, PartialEq, Eq, Hash)]
pub struct SubjectSourceFlattenConfig {
    pub attr: String,
}

#[derive(Deserialize, Serialize, PartialEq, Eq, Hash)]
pub struct SubjectSourceConfig {
    pub dn : String,
    pub name : String,
    #[serde(skip_serializing_if="Option::is_none")]
    pub vue_template : Option<String>,
    #[serde(skip_serializing_if="Option::is_none")]
    pub vue_template_if_ambiguous : Option<String>,    

    #[serde(skip_serializing)]
    pub search_filter : String,
    #[serde(skip_serializing)]
    pub display_attrs : Vec<String>,
    #[serde(skip_serializing)]
    pub flatten_using : Option<SubjectSourceFlattenConfig>,
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
    pub subject_sources: Vec<SubjectSourceConfig>,
    pub groups_flattened_attr: BTreeMap<Mright, String>,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum RemoteDriver { Mysql }

#[derive(Deserialize, Serialize)]
pub struct RemoteConfig {
    pub host: String,
    #[serde(skip_serializing_if="Option::is_none")]
    pub port: Option<u16>,
    pub driver: RemoteDriver,

    #[serde(skip_serializing)]
    pub user: String,
    #[serde(skip_serializing)]
    pub password: String,    
    
    pub periodicity: String, // NB: checked by "remotes_periodicity_checker" below
}
#[derive(Deserialize)]
pub struct Config {
    pub trusted_auth_bearer: Option<String>,
    pub cas: CasConfig,
    pub ldap: LdapConfig,
    #[serde(deserialize_with = "remotes_periodicity_checker")] 
    pub remotes: BTreeMap<String, RemoteConfig>,
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
pub type SgroupAttrs = BTreeMap<Attr, String>;

#[derive(Serialize, PartialEq, Eq, Debug)]
pub struct SgroupOut {
    #[serde(flatten)]
    pub attrs: SgroupAttrs,
    pub kind: GroupKind,
}

pub type SgroupsWithAttrs = BTreeMap<String, SgroupAttrs>;
pub type SubjectAttrs = BTreeMap<String, String>;
pub type Subjects = BTreeMap<String, SubjectAttrs>;

#[derive(Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum SgroupOutMore {
    Stem { children: SgroupsWithAttrs },
    Group { direct_members: Subjects },
}

#[derive(Serialize, PartialEq, Eq, Debug)]
pub struct SgroupAndMoreOut {
    #[serde(flatten)]
    pub attrs: SgroupAttrs,
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
    pub fn from_string(mright: &str) -> Result<Self, String> {
        serde::json::from_str(&format!(r#""{}""#, mright)).map_err(|_| format!("invalid mright {}", mright))
    }
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
