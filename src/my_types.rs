use std::collections::{BTreeMap, HashSet, HashMap};
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
    
    if systemd_calendar_events::next_elapses(
            remotes.values().map(|cfg| &cfg.periodicity).collect()
    ).is_err() {
        // there has been an error, retry one by one to know which one failed
        for (remote_id, cfg) in &remotes {
            if systemd_calendar_events::next_elapse(&cfg.periodicity).is_err() {
                let msg = format!("a valid periodicity for remote {}. Hint: validate it with ''systemd-analyze calendar ....''", remote_id);
                return Err(de::Error::invalid_value(de::Unexpected::Str(&cfg.periodicity), &msg.as_str()));
            }
        }
    }
    Ok(remotes)
}

fn ldap_config_checker<'de, D>(d: D) -> Result<LdapConfig, D::Error>
    where D: de::Deserializer<'de>
{
    let cfg : LdapConfig = LdapConfig::deserialize(d)?;
    
    if cfg.sgroup_sscfg_raw().is_none() {
        let msg = "''ldap.groups_dn'' to be listed in ''ldap.subject_sources''".to_owned();
        return Err(de::Error::invalid_value(de::Unexpected::Str(&cfg.groups_dn.0), &msg.as_str()));
    }
    Ok(cfg)
}

#[derive(Deserialize)]
pub struct StemConfig {
    pub filter: String,
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
    pub dn : Dn,
    pub name : String,
    #[serde(skip_serializing_if="Option::is_none")]
    pub vue_template : Option<String>,
    #[serde(skip_serializing_if="Option::is_none")]
    pub vue_template_if_ambiguous : Option<String>,    
    pub display_attrs : Vec<String>,
    pub id_attrs : Option<Vec<String>>,

    #[serde(skip_serializing)]
    pub search_filter : String,
}

#[derive(Deserialize)]
pub struct AttrTexts {
    pub label: String,
    pub description: String,
}

#[derive(Deserialize)]
pub struct LdapConfig {
    pub url: String,
    pub bind_dn: Dn,
    pub bind_password: String,
    pub base_dn: Dn,
    pub groups_dn: Dn,
    pub stem_object_classes: HashSet<String>,
    pub group_object_classes: HashSet<String>,
    pub sgroup_filter: Option<String>, // needed if groupad does not own all groups in groups_dn
    pub stem: StemConfig,
    pub subject_sources: Vec<SubjectSourceConfig>,
    pub groups_flattened_attr: BTreeMap<Mright, String>,
    pub sgroup_attrs: BTreeMap<String, AttrTexts>,
}
#[derive(Serialize)]
pub struct LdapConfigOut<'a> {
    pub groups_dn: &'a Dn,
    pub subject_sources: &'a Vec<SubjectSourceConfig>,
}

impl LdapConfig {
    pub fn sgroup_sscfg_raw(&self) -> Option<&SubjectSourceConfig> {
        self.subject_sources.iter().find(|sscfg| sscfg.dn == self.groups_dn)
    }
    pub fn sgroup_sscfg(&self) -> &SubjectSourceConfig {
        self.sgroup_sscfg_raw().expect("internal error (should be checked as startup)")
    }

    pub fn to_js_ui(&self) -> LdapConfigOut {
        LdapConfigOut { groups_dn: &self.groups_dn, subject_sources: &self.subject_sources }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "lowercase")]
pub enum RemoteDriver {
    #[cfg(feature = "mysql")]
    Mysql,
    #[cfg(feature = "oracle")]
    Oracle,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RemoteConfig {
    pub host: String,
    #[serde(skip_serializing_if="Option::is_none")]
    pub port: Option<u16>,
    pub driver: RemoteDriver,

    pub db_name: String,

    #[serde(skip_serializing)]
    pub user: String,
    #[serde(skip_serializing)]
    pub password: String,
    
    pub periodicity: String, // NB: checked by "remotes_periodicity_checker" below
}
#[derive(Deserialize)]
pub struct Config {
    pub trusted_auth_bearer: Option<String>,
    pub log_dir: Option<String>,
    pub cas: CasConfig,
    #[serde(deserialize_with = "ldap_config_checker")] 
    pub ldap: LdapConfig,
    #[serde(deserialize_with = "remotes_periodicity_checker")] 
    pub remotes: BTreeMap<String, RemoteConfig>,
}

#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord, Clone, Copy, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Mright { Member, Reader, Updater, Admin }

#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord, Debug, Copy, Clone)]
#[serde(rename_all = "lowercase")]
pub enum Right { Reader, Updater, Admin }

#[derive(Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord, Copy, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum MyMod { Add, Delete, Replace }

#[derive(Deserialize, Serialize, PartialEq, Eq, Debug, Hash, Clone, PartialOrd, Ord)]
#[serde(transparent)] 
pub struct Dn(pub String);

pub type MyMods = BTreeMap<Mright, BTreeMap<MyMod, DnsOpts>>;

impl From<String> for Dn {
    fn from(dn: String) -> Self {
        Dn(dn)
    }
}
impl From<&str> for Dn {
    fn from(dn: &str) -> Self {
        Dn(dn.to_owned())
    }
}

pub type MonoAttrs = BTreeMap<String, String>;

pub type SgroupsWithAttrs = BTreeMap<String, MonoAttrs>;

#[derive(Deserialize, Serialize, PartialEq, Eq, Debug, Clone, Default)]
pub struct DirectOptions {
    #[serde(skip_serializing_if="Option::is_none")]
    pub enddate: Option<String>,
}

pub type DnsOpts = HashMap<Dn, DirectOptions>;

#[derive(Serialize, PartialEq, Eq, Debug)]
pub struct SubjectAttrs {
    pub attrs: MonoAttrs,

    #[serde(skip_serializing_if="Option::is_none")]
    pub sgroup_id: Option<String>,

    #[serde(flatten)]
    pub options: DirectOptions,
}

pub type Subjects = BTreeMap<Dn, SubjectAttrs>;

#[derive(Serialize, PartialEq, Eq, Debug)]
pub struct SubjectsAndCount {
    pub count: usize,
    pub subjects: Subjects,
}

#[derive(Serialize, PartialEq, Eq, Debug)]
pub struct SgroupOutAndRight {
    pub attrs: MonoAttrs,

    pub sgroup_id: String,
    pub right: Option<Right>,
}


#[derive(Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum SgroupOutMore {
    Stem { children: SgroupsWithAttrs },
    Group { direct_members: Subjects },
    SynchronizedGroup { remote_sql_query: RemoteSqlQuery },
}

#[derive(Serialize, PartialEq, Eq, Debug)]
pub struct SgroupAndMoreOut {
    pub attrs: MonoAttrs,
    #[serde(flatten)]
    pub more: SgroupOutMore,

    pub parents: Vec<SgroupOutAndRight>,
    pub right: Right,
}

impl Mright {
    pub fn from_string(mright: &str) -> Result<Self, String> {
        serde::json::from_str(&format!(r#""{}""#, mright)).map_err(|_| format!("invalid mright {}", mright))
    }
    fn to_string(self) -> &'static str {
        match self {
            Self::Member => "member",
            Self::Reader => "reader",
            Self::Updater => "updater",
            Self::Admin => "admin",
        }
    }
    pub fn to_attr(self) -> String {
        format!("memberURL;x-{}", self.to_string())
    }
    pub fn to_attr_synchronized(self) -> String {
        format!("memberURL;x-{};x-remote", self.to_string())
    }
    pub fn list() -> Vec<Self> { vec![Self::Member, Self::Reader, Self::Updater, Self::Admin] }     
}
impl Right {
    pub fn from_string(right: &str) -> Result<Self, String> {
        serde::json::from_str(&format!(r#""{}""#, right)).map_err(|_| format!("invalid right {}", right))
    }
    // NB: best right first
    pub fn to_allowed_rights(self) -> Vec<Self> {
        match self {
            Self::Reader => vec![Self::Admin, Self::Updater, Self::Reader],
            Self::Updater => vec![Self::Admin, Self::Updater],
            Self::Admin => vec![Self::Admin],
        }
    }
    pub fn to_allowed_attrs(self) -> Vec<String> {
        self.to_allowed_rights().iter().map(|r| r.to_attr()).collect()        
    }
    pub fn to_mright(self) -> Mright {
        match self {
            Self::Reader => Mright::Reader,
            Self::Updater => Mright::Updater,
            Self::Admin => Mright::Admin,
        }
    }
    pub fn to_attr(self) -> String {
        self.to_mright().to_attr()
    }
}

#[derive(Debug)]
pub enum LoggedUser {
    TrustedAdmin,
    User(String),
}

impl LoggedUser {
    pub fn to_str(&self) -> &str {
        match self {
            LoggedUser::TrustedAdmin => "TrustedAdmin",
            LoggedUser::User(user) => user,
        }
    }
} 

#[derive(Debug)]
pub enum LoggedUserUrls {
    TrustedAdmin,
    User(HashSet<String>),
}

pub struct CfgAndLU<'a> {
    pub cfg: &'a Config,
    pub user: LoggedUser,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Clone)]
pub struct ToSubjectSource {
    pub ssdn: Dn,
    pub id_attr: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Clone)]
pub struct RemoteSqlQuery {
    pub remote_cfg_name: String, 
    pub select_query: String, // query returns either a DN or a string to transform into DN using ToSubjectSource
    pub to_subject_source: Option<ToSubjectSource>,
}
