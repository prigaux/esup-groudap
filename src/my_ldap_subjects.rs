use std::collections::{BTreeMap, HashMap};

use crate::my_types::*;
use crate::my_err::{Result};
use crate::ldap_wrapper::{LdapW};
use crate::my_ldap::{dn_to_rdn_and_parent_dn};
use crate::my_ldap::{url_to_dn_};
use crate::ldap_filter;


impl SubjectSourceConfig {
    pub fn search_filter_(&self, term: &str) -> String {
        self.search_filter.replace("%TERM%", term).replace(" ", "")
    }
}

async fn get_subjects_from_same_branch(ldp: &mut LdapW<'_>, sscfg: &SubjectSourceConfig, base_dn: &Dn, rdns: &[&str], search_token: &Option<String>) -> Result<Subjects> {
    let rdns_filter = ldap_filter::or(rdns.iter().map(|rdn| ldap_filter::rdn(rdn)).collect());
    let filter = if let Some(term) = search_token {
        ldap_filter::and2(&rdns_filter,&sscfg.search_filter_(term))
    } else {
        rdns_filter
    };
    Ok(ldp.search_subjects(base_dn, &sscfg.display_attrs, dbg!(&filter), None).await?)
}

pub async fn get_subjects_from_urls(ldp: &mut LdapW<'_>, urls: Vec<String>) -> Result<Subjects> {
    get_subjects(ldp, urls.into_iter().filter_map(url_to_dn_).collect(), &None, &None).await
}

fn into_group_map<K: Eq + std::hash::Hash, V, I: Iterator<Item = (K, V)>>(iter: I) -> HashMap<K, Vec<V>> {
    iter.fold(HashMap::new(), |mut map, (k, v)| {
        map.entry(k).or_insert_with(|| Vec::new()).push(v);
        map
    })
}
pub async fn get_subjects(ldp: &mut LdapW<'_>, dns: Vec<Dn>, search_token: &Option<String>, sizelimit: &Option<usize>) -> Result<Subjects> {
    let mut r = BTreeMap::new();


    let parent_dn_to_rdns = into_group_map(dns.iter().filter_map(|dn| {
        let (rdn, parent_dn) = dn_to_rdn_and_parent_dn(dn)?;
        Some((parent_dn, rdn))
    }));
        
    for (parent_dn, rdns) in parent_dn_to_rdns {
        let parent_dn = Dn::from(parent_dn);
        if let Some(sscfg) = ldp.config.dn_to_subject_source_cfg(&parent_dn) {
            let mut count = 0;
            for rdns_ in rdns.chunks(10) {
                let subjects = &mut get_subjects_from_same_branch(ldp, sscfg, &parent_dn, rdns_, search_token).await?;
                count += subjects.len();
                r.append(subjects);
                if let Some(limit) = sizelimit {
                    if count >= *limit { break; }
                }
            }
        }
    }

    Ok(r)
}
