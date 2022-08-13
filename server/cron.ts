/*
use std::collections::BTreeMap;
use std::thread;
use chrono::{Utc, DateTime};

use crate::api_post::may_update_flattened_mrights_rec;
use crate::cache::{AllCaches, self};
use crate::my_types::{Config, LoggedUser, CfgAndLU, Mright};
use crate::my_err::{Result, MyErr};
use crate::ldap_read_search::{LdapW};
use crate::systemd_calendar_events;

#[tokio::main]
pub async fn the_loop(cfg: Config, all_caches: AllCaches) -> Result<()> {
    let r = the_loop_(cfg, all_caches).await;
    if let Err(err) = &r {
        eprintln!("synchronize cron failed: {:?}", err);
    }
    r
}

pub async fn the_loop_(cfg: Config, all_caches: AllCaches) -> Result<()> {
    if cfg.remotes.is_empty() {
        eprintln!("nothing to synchronize (no remotes), exiting cron.");
        return Ok(())
    }
    eprintln!("starting synchronize cron");

    let cfg_and_lu = CfgAndLU { cfg: &cfg, user: LoggedUser::TrustedAdmin };

    let mut remote_to_next_time: BTreeMap<String, DateTime<Utc>> = btreemap![];

    loop {
        let ldp = &mut LdapW::open(&cfg.ldap, &LoggedUser::TrustedAdmin).await?;
        let remote_to_sgroup_ids = cache::get_remote_to_sgroup_ids(ldp, &all_caches.remote_to_sgroup_ids).await?;
        let now = Utc::now();
        for (remote_name, remote_cfg) in cfg.remotes.iter() {
            let next_time = remote_to_next_time.get(dbg!(remote_name)).unwrap_or(&now);
            if next_time <= &now {
                if let Some(sgroup_ids) = remote_to_sgroup_ids.get(remote_name) {
                    eprintln!("synchronizing {:?}", sgroup_ids);
                    let todo = sgroup_ids.iter().map(|id| (id.to_owned(), Mright::Member)).collect();
                    may_update_flattened_mrights_rec(&cfg_and_lu, ldp, todo).await?;
                }
                // compute the next time it should run
                let next_time = systemd_calendar_events::next_elapse(&remote_cfg.periodicity)?;
                remote_to_next_time.insert(remote_name.to_owned(), next_time.with_timezone(&Utc));
            }
        }
        let earlier_next_time = remote_to_next_time.values().min().ok_or(MyErr::Msg("internal error".to_owned()))?;
        if let Ok(time_to_sleep) = (*earlier_next_time - Utc::now()).to_std() {
            eprintln!("sleeping {:?}", time_to_sleep);
            thread::sleep(time_to_sleep);  
        } else {
            eprintln!("next remote became ready during computation of other remotes")
        }
    }
}

*/