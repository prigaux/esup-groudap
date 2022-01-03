use ldap3::{Scope, LdapConnAsync, SearchEntry, SearchOptions, Ldap};
use ldap3::result::{Result};

use super::my_types::*;
use super::ldap_filter;

pub struct LdapW<'a> {
    pub ldap: Ldap,
    pub config: &'a LdapConfig,
    pub logged_user: &'a LoggedUser,
}

pub async fn open<'a>(config: &'a LdapConfig, logged_user: &'a LoggedUser) -> Result<LdapW<'a>> {
    let (conn, mut ldap) = LdapConnAsync::new(&config.url).await?;
    ldap3::drive!(conn);
    ldap.simple_bind(&config.bind_dn, &config.bind_password).await?;
    Ok(LdapW { ldap, config, logged_user })
}


// helper functions
pub async fn read(ldp: &mut LdapW<'_>, dn: &str, attrs: Vec<String>) -> Result<Option<SearchEntry>> {
    let (mut rs, _res) = ldp.ldap.search(dn, Scope::Base, ldap_filter::true_(), attrs).await?.success()?;
    Ok(rs.pop().map(SearchEntry::construct))
}

pub async fn is_dn_matching_filter(ldp: &mut LdapW<'_>, dn: &str, filter: &str) -> Result<bool> {
    let (rs, _res) = ldp.ldap.search(dn, Scope::Base, filter, vec![""]).await?.success()?;
    Ok(!rs.is_empty())
}

pub async fn _is_dn_existing(ldp: &mut LdapW<'_>, dn: &str) -> Result<bool> {
    is_dn_matching_filter(ldp, dn, ldap_filter::true_()).await
}

pub async fn one_group_matches_filter(ldp: &mut LdapW<'_>, filter: &str) -> Result<bool> {
    let (rs, _res) = {
        let opts = SearchOptions::new().sizelimit(1);
        let ldap_ = ldp.ldap.with_search_options(opts);
        ldap_.search(&ldp.config.groups_dn, Scope::Subtree, filter, vec![""]).await?.success()?
    };
    Ok(!rs.is_empty())
}
