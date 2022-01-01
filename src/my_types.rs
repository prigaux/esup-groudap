use std::collections::{BTreeMap, HashSet};
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
