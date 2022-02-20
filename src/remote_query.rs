use std::collections::{BTreeMap, HashSet};

use ldap3::SearchEntry;
use serde::Serialize;

use crate::{
    helpers::before_and_after_char,
    ldap_filter,
    ldap_wrapper::LdapW,
    my_err::{MyErr, Result},
    my_types::{
        CfgAndLU, Dn, RemoteConfig, RemoteDriver, RemoteSqlQuery, Subjects, ToSubjectSource,
    }, my_ldap_subjects::get_subjects,
};

#[cfg(feature = "mysql")]
mod mysql {
    use crate::{
        my_err::{MyErr, Result},
        my_types::RemoteConfig,
    };
    use mysql::prelude::Queryable;

    impl From<mysql::Error> for MyErr {
        fn from(err: mysql::Error) -> Self {
            MyErr::Msg(err.to_string())
        }
    }

    pub fn query(remote: &RemoteConfig, db_name: &str, select_query: &str) -> Result<Vec<String>> {
        let mut opts = mysql::OptsBuilder::new()
            .ip_or_hostname(Some(&remote.host))
            .db_name(Some(db_name))
            .user(Some(&remote.user))
            .pass(Some(&remote.password));
        if let Some(port) = remote.port {
            opts = opts.tcp_port(port)
        }
        let mut conn = mysql::Conn::new(opts)?;

        let rows: Vec<String> = conn.query(select_query)?;
        Ok(rows)
    }
}

#[cfg(feature = "oracle")]
mod oracle {
    use crate::my_types::RemoteConfig;
    use std::collections::Vec;

    pub fn query(remote: &RemoteConfig, select_query: &str) -> Vec<String> {
        todo!()
    }
}

fn raw_query(remote: &RemoteConfig, db_name: &str, select_query: &str) -> Result<Vec<String>> {
    match remote.driver {
        #[cfg(feature = "mysql")]
        RemoteDriver::Mysql => mysql::query(&remote, db_name, select_query),
        #[cfg(feature = "oracle")]
        RemoteDriver::Oracle => oracle::query(&remote, select_query),
    }
}

async fn sql_values_to_dns(
    ldp: &mut LdapW<'_>,
    ssdn: &Dn,
    id_attr: &str,
    sql_values: &Vec<String>,
) -> Result<HashSet<Dn>> {
    let mut r = hashset![];
    for sql_values_ in sql_values.chunks(10) {
        let filter = ldap_filter::or(
            sql_values_
                .iter()
                .map(|val| ldap_filter::eq(id_attr, val))
                .collect(),
        );
        for e in ldp.search_raw(&ssdn.0, &filter, vec![""], None).await? {
            r.insert(Dn(SearchEntry::construct(e).dn));
        }
    }
    Ok(r)
}

impl From<&ToSubjectSource> for String {
    fn from(tss: &ToSubjectSource) -> Self {
        format!("{}?{}", tss.ssdn.0, tss.id_attr)
    }
}

impl From<&RemoteSqlQuery> for String {
    fn from(rsq: &RemoteSqlQuery) -> Self {
        let opt = if let Some(subject) = rsq.to_subject_source.as_ref().map(String::from) {
            format!(" : subject={}", subject)
        } else {
            "".to_owned()
        };
        format!(
            "sql: remote={}{} : {}",
            rsq.remote_cfg_name, opt, rsq.select_query
        )
    }
}
impl From<RemoteSqlQuery> for String {
    fn from(rsq: RemoteSqlQuery) -> Self {
        String::from(&rsq)
    }
}

fn strip_prefix_and_trim<'a>(s: &'a str, prefix: &str) -> Option<&'a str> {
    s.strip_prefix(prefix).map(|s| s.trim_start())
}
fn get_param<'a>(param_name: &str, s: &'a str) -> Option<(&'a str, &'a str)> {
    eprintln!("=>>> {}", s);
    let s = s.strip_prefix(param_name)?;
    let s = s.strip_prefix('=')?;
    let (param, rest) = before_and_after_char(s, ':')?;
    Some((param.trim_end(), rest.trim_start()))
}
fn optional_param<'a>(param_name: &str, s: &'a str) -> (Option<&'a str>, &'a str) {
    if let Some((param, rest)) = get_param(param_name, s) {
        (Some(param), rest)
    } else {
        (None, s)
    }
}
fn parse_to_subject_source(s: &str) -> Result<ToSubjectSource> {
    let (ssdn, id_attr) = before_and_after_char(s, '?')
        .ok_or(MyErr::Msg(format!("expected ou=xxx,dc=xxx?uid, got {}", s)))?;
    Ok(ToSubjectSource {
        ssdn: Dn::from(ssdn),
        id_attr: id_attr.to_owned(),
    })
}
pub fn parse_sql_url(url: &str) -> Result<Option<RemoteSqlQuery>> {
    Ok(if let Some(rest) = strip_prefix_and_trim(url, "sql:") {
        let (remote_cfg_name, rest) = get_param("remote", rest)
            .ok_or(MyErr::Msg(format!("remote= is missing in {}", url)))?;
        let (subject, select) = optional_param("subject", rest);
        let to_subject_source = subject.map(parse_to_subject_source).transpose()?;
        Some(RemoteSqlQuery {
            select_query: select.to_owned(),
            remote_cfg_name: remote_cfg_name.to_owned(),
            to_subject_source,
        })
    } else {
        None
    })
}

pub fn query(
    remotes_cfg: &BTreeMap<String, RemoteConfig>,
    remote: &RemoteSqlQuery,
) -> Result<Vec<String>> {
    let remote_cfg = remotes_cfg
        .get(&remote.remote_cfg_name)
        .ok_or(MyErr::Msg(format!(
            "internal error: unknown remote {}",
            remote.remote_cfg_name
        )))?;
    raw_query(remote_cfg, &remote_cfg.db_name, &remote.select_query)
}

// return subject DNs
pub async fn query_subjects(
    ldp: &mut LdapW<'_>,
    remotes_cfg: &BTreeMap<String, RemoteConfig>,
    remote: &RemoteSqlQuery,
) -> Result<HashSet<Dn>> {
    let sql_values = query(remotes_cfg, remote)?;
    if let Some(to_ss) = &remote.to_subject_source {
        sql_values_to_dns(ldp, &to_ss.ssdn, &to_ss.id_attr, &sql_values).await
    } else {
        // the SQL query must return DNs
        Ok(sql_values.into_iter().map(Dn::from).collect())
    }
}

#[derive(Serialize)]
pub struct TestRemoteQuerySql {
    pub count: usize,
    pub values: Vec<String>,
    pub ss_guess: Option<(ToSubjectSource, Subjects)>,
}

pub async fn test_remote_query_sql(
    ldp: &mut LdapW<'_>,
    cfg_and_lu: &CfgAndLU<'_>,
    remote_sql_query: RemoteSqlQuery,
) -> Result<TestRemoteQuerySql> {
    let mut values = query(&cfg_and_lu.cfg.remotes, &remote_sql_query)?;
    let count = values.len();
    values.truncate(10); // return an extract
    let ss_guess = if count > 3 {
        guest_subject_source(ldp, &values).await?
    } else {
        None
    };
    Ok(TestRemoteQuerySql {
        count,
        values,
        ss_guess,
    })
}

async fn guest_subject_source(ldp: &mut LdapW<'_>, values: &Vec<String>) -> Result<Option<(ToSubjectSource, Subjects)>> {
    let mut best = (0, None);
    for sscfg in &ldp.config.subject_sources {
        if let Some(vec) = &sscfg.id_attrs {
            for id_attr in vec {
                let dns = sql_values_to_dns(ldp, &sscfg.dn, id_attr, values).await?;
                if dns.len() > best.0 {
                    best = (dns.len(), Some((dns, &sscfg.dn, id_attr)));
                }
            }
        }
    }
    Ok(if let Some((dns, ssdn, id_attr)) = best.1 {
        let to_subject_source = ToSubjectSource { ssdn: ssdn.clone(), id_attr: id_attr.to_owned() };
        let subjects = get_subjects(ldp, dns.into_iter().collect(), &None, &None).await?;
        Some((to_subject_source, subjects))
    } else { None })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sql_url() -> Result<()> {
        fn test_ok(url: &str) -> Result<()> {
            let remote = parse_sql_url(url)?;
            assert_eq!(remote.map(String::from), Some(String::from(url)));
            Ok(())
        }
        fn test_err(url: &str) {
            if let Ok(remote) = parse_sql_url(url) {
                assert!(false, "unexpected success {:?}", remote);
            }
        }
        test_ok(
            "sql: remote=foo : subject=ou=people,dc=nodomain?uid : select username from users",
        )?;
        test_ok("sql: remote=foo : select concat('uid=', username, ',ou=people,dc=nodomain') from users")?;
        test_err("sql: select username from users");
        Ok(())
    }
}
