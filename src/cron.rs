use core::time;
use std::thread;

use crate::my_types::{Config, LoggedUser};
use crate::rocket_helpers::Cache;
use crate::my_err::{Result};
use crate::ldap_wrapper::{LdapW};

#[tokio::main]
pub async fn the_loop(config: Config, cache: Cache) -> Result<()> {
    let ldp = &mut LdapW::open(&config.ldap, &LoggedUser::TrustedAdmin).await?;
    let test_sgroup = ldp.read_sgroup("collab.", vec!["description"]).await?;
    eprintln!("in thread {:?}", test_sgroup);
    loop {
        thread::sleep(time::Duration::from_secs(500));
        let map = cache.synchronized_groups.lock().unwrap().clone();
        println!("Hello from spawned thread {:?}", map);
    }
}

