use std::collections::{HashSet, BTreeMap};

use crate::{my_types::{RemoteConfig, RemoteDriver, RemoteSqlQuery, ToSubjectSource, Dn}, my_err::{Result, MyErr}, ldap_filter, ldap_wrapper::LdapW, helpers::{before_and_after_char}};

#[cfg(feature = "mysql")]
mod mysql {
    use crate::{my_types::RemoteConfig, my_err::{Result, MyErr}};
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
    use std::collections::Vec;
    use crate::my_types::RemoteConfig;

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

async fn entries_to_dns(ldp: &mut LdapW<'_>, ssdn: &Dn, id_attr: &str, entries: Vec<String>) -> Result<HashSet<Dn>> {
    let mut r = hashset![];
    for entry in entries {
        if let Some(e) = ldp.search_one(&ssdn.0,&ldap_filter::eq(id_attr, &entry), vec![""]).await? {
            r.insert(Dn(e.dn));
        } else {

        }
    }
    Ok(r)
}

impl From<&ToSubjectSource> for String {   
    fn from(tss: &ToSubjectSource) -> Self {
        format!("{}?{}", tss.ssdn.0, tss.id_attr)
    }
}

impl From<RemoteSqlQuery> for String {

    fn from(rsq: RemoteSqlQuery) -> Self {
        let opt = 
            if let Some(subject) = rsq.to_subject_source.as_ref().map(String::from) {
                format!(" : subject={}", subject)
            } else {
                "".to_owned()
            };
        format!("sql: remote={}{} : {}", rsq.remote_cfg_name, opt, rsq.select_query)
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
    Ok(ToSubjectSource { ssdn: Dn::from(ssdn), id_attr: id_attr.to_owned() })
}
pub fn parse_sql_url(url: String) -> Result<Option<RemoteSqlQuery>> {
    Ok(if let Some(rest) = strip_prefix_and_trim(&url, "sql:") {        
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

// return subject DNs
pub async fn query(ldp: &mut LdapW<'_>, remotes_cfg: &BTreeMap<String, RemoteConfig>, remote: &RemoteSqlQuery) -> Result<HashSet<Dn>> {
    let remote_cfg = remotes_cfg.get(&remote.remote_cfg_name).ok_or(MyErr::Msg(format!("internal error: unknown remote {}", remote.remote_cfg_name)))?;
    let entries = raw_query(remote_cfg, &remote_cfg.db_name, &remote.select_query)?;
    if let Some(to_ss) = &remote.to_subject_source {
        entries_to_dns(ldp, &to_ss.ssdn, &to_ss.id_attr, entries).await
    } else {
        // the SQL query must return DNs
        Ok(entries.into_iter().map(Dn::from).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sql_url() -> Result<()> {
        fn test_ok(url: &str) -> Result<()> {
            let remote = parse_sql_url(url.to_owned())?;
            assert_eq!(remote.map(String::from), Some(String::from(url)));
            Ok(())
        }
        fn test_err(url: &str) {
            if let Ok(remote) = parse_sql_url(url.to_owned()) {
                assert!(false, "unexpected success {:?}", remote);
            }
        }
        test_ok("sql: remote=foo : subject=ou=people,dc=nodomain?uid : select username from users")?;
        test_ok("sql: remote=foo : select concat('uid=', username, ',ou=people,dc=nodomain') from users")?;
        test_err("sql: select username from users");
        Ok(())
    }

}