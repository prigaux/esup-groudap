use std::collections::{HashMap};

use ldap3::{Scope, LdapConnAsync, ResultEntry, SearchResult, SearchEntry, SearchOptions, Ldap};
use ldap3::result::{Result, LdapError};

use super::my_types::*;
use super::ldap_filter;

pub struct LdapW<'a> {
    pub ldap: Ldap,
    pub config: &'a LdapConfig,
    pub logged_user: &'a LoggedUser,
}

fn handle_read_one_search_result(res : SearchResult) -> Result<Option<ResultEntry>> {
    if res.1.rc == 0 {
        let mut l = res.0;
        Ok(l.pop())
    } else if res.1.rc == 32 /* NoSuchObject */ {
        Ok(None)
    } else {
        Err(LdapError::from(res.1))
    }
}

impl LdapW<'_> {
    pub async fn open_<'a>(cfg_and_lu: &'a CfgAndLU<'a>) -> Result<LdapW<'a>> {
        Self::open(&cfg_and_lu.cfg.ldap, &cfg_and_lu.user).await
    }

    pub async fn open<'a>(config: &'a LdapConfig, logged_user: &'a LoggedUser) -> Result<LdapW<'a>> {
        let (conn, mut ldap) = LdapConnAsync::new(&config.url).await?;
        ldap3::drive!(conn);
        ldap.simple_bind(&config.bind_dn, &config.bind_password).await?;
        Ok(LdapW { ldap, config, logged_user })
    }
    
    pub async fn read<'a, S: AsRef<str> + Send + Sync + 'a>(self: &mut Self, dn: &str, attrs: Vec<S>) -> Result<Option<SearchEntry>> {
        let res = self.ldap.search(dn, Scope::Base, ldap_filter::true_(), attrs).await?;
        let res = handle_read_one_search_result(res)?;
        Ok(res.map(SearchEntry::construct))
    }

    pub async fn read_one_multi_attr(self: &mut Self, dn: &str, attr: &str) -> Result<Option<Vec<String>>> {
        let entry = self.read(dn, vec![attr]).await?;
        Ok(entry.map(|e| get_consume(e.attrs, attr)))
    }

    #[allow(non_snake_case)]
    pub async fn read_one_multi_attr__or_err(self: &mut Self, dn: &str, attr: &str) -> Result<Vec<String>> {
        self.read_one_multi_attr(dn, attr).await?.ok_or_else(
            || LdapError::AdapterInit(format!("internal error (read_one_multi_attr__or_err expects {} to exist)", dn))
        )
    }

    pub async fn read_flattened_members(self: &mut Self, dn: &str) -> Result<Vec<String>> {
        let l = self.read_one_multi_attr__or_err(&dn, "member").await?;
        // turn [""] into []
        Ok(match l.get(0) {
            Some(s) if s.is_empty() => vec![],
            _ => l
        })
    }

    pub async fn is_dn_matching_filter(self: &mut Self, dn: &str, filter: &str) -> Result<bool> {
        let res = self.ldap.search(dn, Scope::Base, filter, vec![""]).await?;
        let res = handle_read_one_search_result(res)?;
        Ok(res.is_some())
    }

    pub async fn is_dn_existing(self: &mut Self, dn: &str) -> Result<bool> {
        self.is_dn_matching_filter(dn, ldap_filter::true_()).await
    }

    pub async fn one_group_matches_filter(self: &mut Self, filter: &str) -> Result<bool> {
        let (rs, _res) = {
            let opts = SearchOptions::new().sizelimit(1);
            let ldap_ = self.ldap.with_search_options(opts);
            ldap_.search(&self.config.groups_dn, Scope::Subtree, filter, vec![""]).await?.success()?
        };
        Ok(!rs.is_empty())
    }

    /*pub async fn search_one_mono_attr(self: &mut Self, base: &str, filter: &str, attr: &str) -> Result<Vec<String>> {
        let (rs, _res) = self.ldap.search(base, Scope::Subtree, filter, vec![attr]).await?.success()?;
        Ok(rs.into_iter().filter_map(|r| result_entry_to_mono_attr(r, attr)).collect())
    }*/
}

/*fn result_entry_to_mono_attr(r: ldap3::ResultEntry, attr: &str) -> Option<String> {
    let attrs = &mut SearchEntry::construct(r).attrs;
    attrs.remove(attr)?.pop()
}*/

fn get_consume<T>(mut map: HashMap<String, Vec<T>>, key: &str) -> Vec<T> {
    map.remove(key).unwrap_or_default()
}

