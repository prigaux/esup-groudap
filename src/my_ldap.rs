use std::collections::{HashSet};
use ldap3::{Scope, SearchEntry, Mod};
use ldap3::result::{Result, LdapResult, LdapError};
type LdapAttrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use super::ldap_wrapper::LdapW;
use super::my_types::*;
use super::ldap_filter;

// ("a.b.c", ".") => Some("a.b")
// ("a", ".") => None
fn rbefore<'a>(s: &'a str, end: &'a str) -> Option<&'a str> {
    Some(&s[..s.rfind(end)?])
}

impl StemConfig {
    // "a.b.c" => Some("a.b")
    // "a" => Some("ROOT")
    // "ROOT" => None
    pub fn parent_stem<'a>(self: &'a Self, id: &'a str) -> Option<&'a str> {
        rbefore(id, &self.separator).or_else(|| if id == self.root_id { None } else { Some(&self.root_id) })
    }

    // "a.b.c" => ["a.b", "a", "ROOT"]
    pub fn parent_stems<'a>(self: &'a Self, id: &'a str) -> Vec<&'a str> {
        let mut stems : Vec<&str> = Vec::new();
        let mut id = id;
        while let Some(parent) = self.parent_stem(id) {
            id = parent;
            stems.push(parent);
        }
        return stems;
    }
    pub fn validate_sgroup_id(self: &Self, id: &str) -> Result<()> {
        for one in id.split(&self.separator) {
            if one == "" || one.contains(|c: char| !c.is_alphanumeric() && c != '_' && c != '-') {
                return Err(LdapError::AdapterInit(format!("invalid sgroup id")))
            }
        }
        Ok(())
    }   
}

impl LdapConfig {
    pub fn sgroup_id_to_dn<S : AsRef<str>>(self: &Self, cn: S) -> String {
        format!("cn={},{}", cn.as_ref(), self.groups_dn)
    }
    pub fn people_id_to_dn(self: &Self, cn: &str) -> String {
        format!("uid={},ou=people,{}", cn, self.base_dn)
    }
}

pub fn dn_to_url(dn: &str) -> String {
    format!("ldap:///{}", dn)
}

pub fn url_to_dn(url: &str) -> Option<&str> {
    url.strip_prefix("ldap:///").filter(|dn| !dn.contains("?"))
}

// wow, it is complex...
fn hashset_as_deref(elts : &HashSet<String>) -> HashSet<&str> {
    let mut set: HashSet<&str> = HashSet::new();
    for e in elts { set.insert(&e); }
    set
}


impl LdapW<'_> {
    pub async fn is_sgroup_matching_filter(self: &mut Self, id: &str, filter: &str) -> Result<bool> {
        self.is_dn_matching_filter(&self.config.sgroup_id_to_dn(id), filter).await
    }    
    pub async fn is_sgroup_existing(self: &mut Self, id: &str) -> Result<bool> {
        self.is_sgroup_matching_filter(id, ldap_filter::true_()).await
    }
    
    pub async fn is_group(self: &mut Self, id: &str) -> Result<bool> {
        self.is_sgroup_matching_filter(id, ldap_filter::group()).await
    }
    pub async fn is_stem(self: &mut Self, id: &str) -> Result<bool> {
        Ok(!self.is_group(id).await?)
    }

    pub async fn ldap_add_group(self: &mut Self, kind: GroupKind, cn: &str, attrs: LdapAttrs<'_>) -> Result<LdapResult> {
        let base_attrs = {
            let object_classes = match kind {
                GroupKind::GROUP => &self.config.group_object_classes,
                _ => &self.config.stem_object_classes,
            };
            vec![
                ("objectClass", hashset_as_deref(object_classes)),
                ("cn", hashset!{cn}),
            ]
        };
        let member_attr = match kind {
            GroupKind::GROUP => vec![("member", hashset!{""})],  // "member" is requested...
            _ => vec![],
        };
        let all_attrs = [ base_attrs, attrs, member_attr ].concat();
        self.ldap.add(&self.config.sgroup_id_to_dn(cn), all_attrs).await
    }

    pub async fn delete_sgroup(self: &mut Self, id: &str) -> Result<LdapResult> {
        self.ldap.delete(&self.config.sgroup_id_to_dn(id)).await
    }
 
    pub async fn read_sgroup<'a, S: AsRef<str> + Send + Sync + 'a>(self: &mut Self, id: &str, attrs: Vec<S>) -> Result<Option<SearchEntry>> {
        let dn = self.config.sgroup_id_to_dn(id);
        self.read(&dn, attrs).await
    }

    pub async fn user_groups(self: &mut Self, user_dn: &str) -> Result<HashSet<String>> {
        let (rs, _res) = {
            let filter = ldap_filter::member(user_dn);
            self.ldap.search(&self.config.groups_dn, Scope::Subtree, &filter, vec![""]).await?.success()?
        };
        Ok(rs.into_iter().map(|r| SearchEntry::construct(r).dn).collect())
    }

    pub async fn user_groups_and_user(self: &mut Self, user: &str) -> Result<HashSet<String>> {
        let user_dn = self.config.people_id_to_dn(user);
        let mut user_groups = self.user_groups(&user_dn).await?;
        user_groups.insert(user_dn);
        Ok(user_groups)
    }
}


// re-format: vector of (string key, hashset value)
fn to_ldap_attrs<'a>(attrs: &'a Attrs) -> LdapAttrs<'a> {
    attrs.iter().map(|(name, value)|
        (name.to_string(), hashset![&value as &str])
    ).collect()
}

pub async fn create_sgroup(ldp: &mut LdapW<'_>, kind: GroupKind, id: &str, attrs: Attrs) -> Result<LdapResult> {    
    ldp.ldap_add_group(kind, id, to_ldap_attrs(&attrs)).await
}


fn to_ldap_mods(mods : MyMods) -> Vec<Mod<String>> {
    let mut r = vec![];
    for (right, submods) in mods {
        let attr = right.to_attr();
        for (action, list) in submods {
            let mod_ = match action { MyMod::ADD => Mod::Add, MyMod::DELETE => Mod::Delete, MyMod::REPLACE => Mod::Replace };
            r.push(mod_(attr.to_string(), list));
        }
    }
    r
}

pub async fn modify_direct_members_or_rights(ldp: &mut LdapW<'_>, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    if ldp.is_stem(id).await? && my_mods.contains_key(&Mright::MEMBER) { 
        Err(LdapError::AdapterInit("MEMBER not allowed for stems".to_owned()))
    } else {
        let mods = to_ldap_mods(my_mods);
        ldp.ldap.modify(&ldp.config.sgroup_id_to_dn(id), mods).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stem_config() -> StemConfig {
        StemConfig { separator: ".".to_owned(), root_id: "ROOT".to_owned() }    
    }

    #[test]
    fn parent_stem() {
        let cfg = stem_config();
        assert_eq!(cfg.parent_stem("a.b.c"), Some("a.b"));
        assert_eq!(cfg.parent_stem("a"), Some("ROOT"));
        assert_eq!(cfg.parent_stem("ROOT"), None);

        assert_eq!(cfg.parent_stems("a.b.c"), ["a.b", "a", "ROOT"]);
    }

    #[test]
    fn validate_sgroup_id() {
        let cfg = stem_config();
        assert!(cfg.validate_sgroup_id("a.b.c").is_ok());
        assert!(cfg.validate_sgroup_id("ROOT").is_ok());
        assert!(cfg.validate_sgroup_id("a.b-c_D").is_ok());

        assert!(cfg.validate_sgroup_id("a.").is_err());
        assert!(cfg.validate_sgroup_id(".").is_err());
        assert!(cfg.validate_sgroup_id("a[").is_err());
        assert!(cfg.validate_sgroup_id("a,").is_err());
    }
}