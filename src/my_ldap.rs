use std::collections::{HashSet, HashMap};
use ldap3::{SearchEntry, Mod};
type CreateLdapAttrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use crate::helpers::{before_and_after, before_and_between_and_after, generalized_time_to_iso8601, iso8601_to_generalized_time};
use crate::my_err::{Result, MyErr};
use crate::ldap_wrapper::{mono_attrs};

use crate::ldap_wrapper::LdapW;
use crate::my_types::*;
use crate::ldap_filter;

// ("a.b.c", ".") => Some("a.b.")
// ("a", ".") => None
fn rbefore<'a>(s: &'a str, end: &'a str) -> Option<&'a str> {
    Some(&s[..(s.rfind(end)? + end.len())])
}

impl StemConfig {
    // "a.b.c." => Some("a.b.")
    // "a.b.c" => Some("a.b.")
    // "a." => Some("")
    // "a" => Some("")
    // "" => None
    pub fn parent_stem<'a>(&'a self, id: &'a str) -> Option<&'a str> {
        if id == self.root_id { 
            None
        } else {
            let id = id.strip_suffix(&self.separator).unwrap_or(id);
            rbefore(id, &self.separator).or(Some(&self.root_id))
        }
    }

    // "a.b.c" => ["a.b.", "a.", ""]
    pub fn parent_stems<'a>(&'a self, id: &'a str) -> Vec<&'a str> {
        let mut stems : Vec<&str> = Vec::new();
        let mut id = id;
        while let Some(parent) = self.parent_stem(id) {
            id = parent;
            stems.push(parent);
        }
        stems
    }
    pub fn validate_sgroup_id(&self, id: &str) -> Result<()> {
        if id == self.root_id { return Ok(()) }
        let id = id.strip_suffix(&self.separator).unwrap_or(id);
        for one in id.split(&self.separator) {
            if one.is_empty() || one.contains(|c: char| !c.is_alphanumeric() && c != '_' && c != '-') {
                return Err(MyErr::Msg("invalid sgroup id".to_owned()))
            }
        }
        Ok(())
    }

    pub fn is_stem(&self, id: &str) -> bool {
        id == self.root_id || id.ends_with('.')
    }    
    
    pub fn is_grandchild(&self, parent: &str, gchild: &str) -> bool {
        if let Some(sub) = gchild.strip_prefix(parent) {
            let sub = sub.strip_suffix(&self.separator).unwrap_or(sub);
            sub.contains(&self.separator)
        } else {
            // weird? should panic?
            false
        }
    }
}

impl LdapConfig {
    pub fn sgroup_id_to_dn<S : AsRef<str>>(&self, cn: S) -> Dn {
        let cn = cn.as_ref();
        if cn == self.stem.root_id {
            self.groups_dn.to_owned()
        } else {
            Dn(format!("cn={},{}", cn, self.groups_dn.0))
        }
    }
    pub fn people_id_to_dn(&self, cn: &str) -> Dn {
        Dn(format!("uid={},ou=people,{}", cn, self.base_dn.0))
    }
    pub fn dn_to_sgroup_id_(&self, dn: &Dn) -> Option<String> {
        self.dn_to_sgroup_id(&dn.0)
    }
    pub fn dn_to_sgroup_id(&self, dn: &str) -> Option<String> {
        if dn == self.groups_dn.0 {
            Some("".to_owned())
        } else {
            Some(dn.strip_suffix(&self.groups_dn.0)?.strip_suffix(',')?.strip_prefix("cn=")?.to_owned())
        }
    }
    pub fn dn_is_sgroup(&self, dn: &Dn) -> bool {
        dn.0.ends_with(&self.groups_dn.0)
    }

    pub fn dn_to_subject_source_cfg(&self, dn: &Dn) -> Option<&SubjectSourceConfig> {
        self.subject_sources.iter().find(|sscfg| dn.0.ends_with(&sscfg.dn.0))
    }
    
    pub fn to_flattened_attr(&self, mright: Mright) -> &str {
        self.groups_flattened_attr.get(&mright).unwrap_or_else(|| panic!("missing {:?} key in ldap.groups_flattened_attr configuration", mright))
    }

    pub fn validate_sgroups_attrs(&self, attrs: &MonoAttrs) -> Result<()> {
        for attr in attrs.keys() {
            if !self.sgroup_attrs.contains_key(attr) {
                return Err(MyErr::Msg(format!("sgroup attr {} is not listed in conf [ldap.sgroup_attrs]", attr)))
            }
        }
        Ok(())
    }

    pub fn user_has_direct_right_on_group_filter(&self, user_dn: &Dn, right: &Right) -> String {
        ldap_filter::or(right.to_allowed_rights().into_iter().map(|r| 
            ldap_filter::eq(self.to_flattened_attr(r.to_mright()), &user_dn.0)
        ).collect())
    }    
    
    pub fn sgroup_filter(&self, id: &str) -> String {
        if id.is_empty() {
            "(objectClass=organizationalUnit)".to_owned()
        } else {
            ldap_filter::eq("cn", id)
        }
    }
   
    
}

pub fn dn_to_rdn_and_parent_dn(dn: &Dn) -> Option<(&str, &str)> {
    before_and_after(&dn.0, ",")
}

pub fn dn_opts_to_url((dn, opts): (&Dn, &DirectOptions)) -> String {
    if let Some(enddate) = &opts.enddate {
        if let Some(gtime) = iso8601_to_generalized_time(enddate) {
            // not standard LDAP filter. inspired from https://www.ietf.org/archive/id/draft-pluta-ldap-srv-side-current-time-match-01.txt
            return format!("ldap:///{}???(serverTime<{})", dn.0, gtime)
        }
    }
    dn_to_url(dn)
}

pub fn dn_to_url(dn: &Dn) -> String {
    format!("ldap:///{}", dn.0)
}

pub fn url_to_dn(url: &str) -> Option<(&str, DirectOptions)> {
    let dn = url.strip_prefix("ldap:///")?;
    if let Some((dn, enddate_, "")) = before_and_between_and_after(dn, "???(serverTime<", ")") {
        Some((dn, DirectOptions { enddate: generalized_time_to_iso8601(enddate_) } ))
    } else if dn.contains('?') {
        None
    } else { 
        Some((dn, DirectOptions { enddate: None } ))
    }
}

pub fn url_to_dn_(url: String) -> Option<(Dn, DirectOptions)> {
    let (dn, opts) = url_to_dn(&url)?;
    Some((Dn::from(dn), opts))
}

pub fn urls_to_dns(urls: Vec<String>) -> Option<DnsOpts> {
    urls.into_iter().map(url_to_dn_).collect::<Option<HashMap<_,_>>>()
}

// wow, it is complex...
fn hashset_as_deref(elts : &HashSet<String>) -> HashSet<&str> {
    let mut set: HashSet<&str> = HashSet::new();
    for e in elts { set.insert(e); }
    set
}

pub fn shallow_copy_vec(v : &[String]) -> Vec<&str> {
    v.iter().map(AsRef::as_ref).collect()
}

impl LdapW<'_> {
    pub async fn is_sgroup_matching_filter(&mut self, id: &str, filter: &str) -> Result<bool> {
        self.is_dn_matching_filter(&self.config.sgroup_id_to_dn(id), filter).await
    }    
    pub async fn is_sgroup_existing(&mut self, id: &str) -> Result<bool> {
        self.is_sgroup_matching_filter(id, ldap_filter::true_()).await
    }
    
    pub async fn ldap_add_group(&mut self, cn: &str, attrs: CreateLdapAttrs<'_>) -> Result<()> {
        let is_stem = self.config.stem.is_stem(cn);
        let base_attrs = {
            let object_classes = if is_stem {
                &self.config.stem_object_classes
            } else {
                &self.config.group_object_classes
            };
            vec![
                ("objectClass", hashset_as_deref(object_classes)),
                ("cn", hashset!{cn}),
            ]
        };
        let member_attr = if is_stem {
            vec![]
        } else {
            vec![("member", hashset!{""})]  // "member" is requested...
        };
        let all_attrs = [ base_attrs, attrs, member_attr ].concat();
        self.ldap.add(&self.config.sgroup_id_to_dn(cn).0, all_attrs).await?.success()?;
        Ok(())
    }

    pub async fn delete_sgroup(&mut self, id: &str) -> Result<()> {
        self.ldap.delete(&self.config.sgroup_id_to_dn(id).0).await?.success()?;
        Ok(())
    }
 
    pub async fn read_direct_mright(&mut self, group_dn: &Dn, mright: Mright) -> Result<Option<DnsOpts>> {
        let direct_urls = self.read_one_multi_attr__or_err(&group_dn, &mright.to_attr()).await?;
        Ok(urls_to_dns(direct_urls))
    }

    pub async fn read_sgroup<'a, S: AsRef<str> + Send + Sync + 'a>(&mut self, id: &str, attrs: Vec<S>) -> Result<Option<SearchEntry>> {
        let dn = self.config.sgroup_id_to_dn(id);
        self.read(&dn, attrs).await
    }

    pub async fn search_sgroups(&mut self, filter: &str, attrs: Vec<&String>, sizelimit: Option<i32>) -> Result<impl Iterator<Item = SearchEntry>> {
        let rs = self.search_raw(&self.config.groups_dn.0, dbg!(filter), attrs, sizelimit).await?;
        let z = rs.into_iter().map(|r| { SearchEntry::construct(r) });
        Ok(z)
    }   

    pub async fn search_sgroups_dn(&mut self, filter: &str) -> Result<impl Iterator<Item = Dn>> {
        Ok(self.search_sgroups(dbg!(filter), vec![&"".to_owned()], None).await?.map(|e| { Dn(e.dn) }))
    }
    
    pub async fn search_sgroups_id(&mut self, filter: &str) -> Result<HashSet<String>> {
        Ok(self.search_sgroups_dn(filter).await?.map(|dn| {
            self.config.dn_to_sgroup_id_(&dn).unwrap_or_else(|| panic!("weird DN {}", dn.0))
        }).collect())
    }

    async fn user_groups_dn(&mut self, user_dn: &Dn) -> Result<HashSet<Dn>> {
        let filter = ldap_filter::member(user_dn);
        let l = self.search_sgroups_dn(&filter).await?.collect();
        Ok(l)
    }

    // returns DNs
    pub async fn user_groups_and_user_dn(&mut self, user: &str) -> Result<HashSet<Dn>> {
        let user_dn = self.config.people_id_to_dn(user);
        let mut user_groups: HashSet<_> = self.user_groups_dn(&user_dn).await?;
        user_groups.insert(user_dn);
        Ok(user_groups)
    }

    pub async fn search_subjects(&mut self, base_dn: &Dn, attrs: &[String], filter: &str, dn2opts: &mut DnsOpts, sizelimit: Option<i32>) -> Result<Subjects> {
        let attrs = shallow_copy_vec(attrs);
        let rs = self.search_raw(&base_dn.0, dbg!(filter), attrs, sizelimit).await?;
        Ok(rs.into_iter().map(|r| { 
            let entry = SearchEntry::construct(r);
            let sgroup_id = self.config.dn_to_sgroup_id(&entry.dn);
            let dn = Dn(entry.dn);
            let options = dn2opts.remove(&dn).unwrap_or_default();
            (dn, SubjectAttrs { attrs: mono_attrs(entry.attrs), sgroup_id, options })
        }).collect())
    }   

}


// re-format: vector of (string key, hashset value)
fn mono_to_multi_attrs(attrs: &MonoAttrs) -> CreateLdapAttrs<'_> {
    attrs.iter().map(|(name, value)|
        (name.as_str(), hashset![value.as_str()])
    ).collect()
}

pub async fn create_sgroup(ldp: &mut LdapW<'_>, id: &str, attrs: &MonoAttrs) -> Result<()> {
    ldp.ldap_add_group(id, mono_to_multi_attrs(attrs)).await
}

pub async fn modify_sgroup_attrs(ldp: &mut LdapW<'_>, id: &str, attrs: &MonoAttrs) -> Result<()> {
    let mods = attrs.iter().map(|(attr, val)| {
        Mod::Replace(attr, if val == "" { hashset![] } else { hashset![val] })
    }).collect();
    ldp.ldap.modify(&ldp.config.sgroup_id_to_dn(id).0, mods).await?.success()?;
    Ok(())
}

fn to_ldap_mods(mods : &MyMods) -> Vec<Mod<String>> {
    let mut r = vec![];
    for (right, submods) in mods {
        let attr = right.to_attr();
        for (action, list) in submods {
            let mod_ = match action { MyMod::Add => Mod::Add, MyMod::Delete => Mod::Delete, MyMod::Replace => Mod::Replace };
            r.push(mod_(attr.to_string(), list.iter().map(|dn| dn_opts_to_url(dn)).collect()));
        }
    }
    r
}

pub async fn modify_direct_members_or_rights(ldp: &mut LdapW<'_>, id: &str, my_mods: &MyMods) -> Result<()> {
    if ldp.config.stem.is_stem(id) && my_mods.contains_key(&Mright::Member) { 
        Err(MyErr::Msg("Member not allowed for stems".to_owned()))
    } else {
        let mods = to_ldap_mods(my_mods);
        ldp.ldap.modify(&ldp.config.sgroup_id_to_dn(id).0, mods).await?.success()?;
        Ok(())
    }
}

pub async fn user_urls_(ldp: &mut LdapW<'_>, user: &str) -> Result<HashSet<String>> {
    let r = Ok(ldp.user_groups_and_user_dn(user).await?.iter().map(|dn| dn_to_url(dn)).collect());
    eprintln!("    user_urls({}) => {:?}", user, r);
    r
}

pub fn user_has_right_on_sgroup_filter(user_urls: &HashSet<String>, right: &Right) -> String {
    ldap_filter::or(
        right.to_allowed_attrs().into_iter().flat_map(|attr| {
            user_urls.iter().map(|url| ldap_filter::eq(&attr,url)).collect::<Vec<_>>()
        }).collect()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stem_config() -> StemConfig {
        StemConfig { filter: "(objectClass=organizationalRole)".to_owned(), separator: ".".to_owned(), root_id: "".to_owned() }    
    }

    #[test]
    fn parent_stem() {
        let cfg = stem_config();
        assert_eq!(cfg.parent_stem("a.b.c"), Some("a.b."));
        assert_eq!(cfg.parent_stem("a.b.c."), Some("a.b."));
        assert_eq!(cfg.parent_stem("a"), Some(""));
        assert_eq!(cfg.parent_stem("a."), Some(""));
        assert_eq!(cfg.parent_stem(""), None);

        assert_eq!(cfg.parent_stems("a.b.c"), ["a.b.", "a.", ""]);
        assert_eq!(cfg.parent_stems("a."), [""]);
        assert_eq!(cfg.parent_stems(""), [] as [&str; 0]);
    }

    #[test]
    fn validate_sgroup_id() {
        let cfg = stem_config();
        assert!(cfg.validate_sgroup_id("a.b.c").is_ok());
        assert!(cfg.validate_sgroup_id("a.b.c.").is_ok());
        assert!(cfg.validate_sgroup_id("a").is_ok());
        assert!(cfg.validate_sgroup_id("a.").is_ok());
        assert!(cfg.validate_sgroup_id("").is_ok());
        assert!(cfg.validate_sgroup_id("a.b-c_D").is_ok());

        assert!(cfg.validate_sgroup_id(".a").is_err());
        assert!(cfg.validate_sgroup_id(".").is_err());
        assert!(cfg.validate_sgroup_id("a[").is_err());
        assert!(cfg.validate_sgroup_id("a,").is_err());
    }

    #[test]
    fn is_grandchild() {
        let cfg = stem_config();
        assert!(cfg.is_grandchild("a.", "a.b.c"));
        assert!(cfg.is_grandchild("a.", "a.b.c."));
        assert!(cfg.is_grandchild("a.", "a.b.c.d"));
        assert!(!cfg.is_grandchild("a.", "a."));
        assert!(!cfg.is_grandchild("a.", "a.b"));
        assert!(!cfg.is_grandchild("a.", "a.b."));

        assert!(cfg.is_grandchild("", "a.b"));
        assert!(cfg.is_grandchild("", "a.b."));
        assert!(cfg.is_grandchild("", "a.b.c"));
        assert!(!cfg.is_grandchild("", ""));
        assert!(!cfg.is_grandchild("", "b"));
        assert!(!cfg.is_grandchild("", "b."));
    }

    fn ldap_config() -> LdapConfig {
        LdapConfig { 
            url: "".to_owned(),
            bind_dn: Dn::from(""),
            bind_password: "".to_owned(),
            base_dn: Dn::from("dc=nodomain"),
            groups_dn: Dn::from("ou=groups,dc=nodomain"),
            stem_object_classes: hashset![],
            group_object_classes: hashset![],
            sgroup_filter: None,
            stem: stem_config(),
            subject_sources: vec![],
            sgroup_attrs: btreemap![],
            groups_flattened_attr: btreemap![
                Mright::Member => "member".to_owned(),
                Mright::Reader => "supannGroupeLecteurDN".to_owned(),
                Mright::Updater => "supannGroupeAdminDN".to_owned(),
                Mright::Admin => "owner".to_owned(),
            ],
        }
    }

    #[test]
    fn sgroup_id_to_dn() {
        let cfg = ldap_config();
        assert_eq!(cfg.sgroup_id_to_dn("a").0, "cn=a,ou=groups,dc=nodomain");
        assert_eq!(cfg.sgroup_id_to_dn("").0, "ou=groups,dc=nodomain");
    }

    #[test]
    fn dn_to_sgroup_id() {
        let cfg = ldap_config();
        assert_eq!(cfg.dn_to_sgroup_id("cn=a,ou=groups,dc=nodomain"), Some("a".to_owned()));
        assert_eq!(cfg.dn_to_sgroup_id("ou=groups,dc=nodomain"), Some("".to_owned()));
    }

}