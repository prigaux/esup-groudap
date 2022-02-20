use core::time;
use std::thread;

use crate::my_types::{Config, LoggedUser};
use crate::remote_query;
use crate::rocket_helpers::Cache;
use crate::my_err::{Result};
use crate::ldap_wrapper::{LdapW};

#[tokio::main]
pub async fn the_loop(config: Config, cache: Cache) -> Result<()> {
    let ldp = &mut LdapW::open(&config.ldap, &LoggedUser::TrustedAdmin).await?;

    let remote = remote_query::parse_sql_url("sql: remote=foo : subject=ou=people,dc=nodomain?uid : select username from users")?.unwrap();

    let dns = remote_query::query_subjects(ldp, &config.remotes, &remote).await.unwrap();
    eprintln!(">>> in thread {:?}", dns);
    loop {
        thread::sleep(time::Duration::from_secs(500));
        let map = cache.synchronized_groups.lock().unwrap().clone();
        println!("Hello from spawned thread {:?}", map);
    }
}

