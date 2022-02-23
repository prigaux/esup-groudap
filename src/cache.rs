use std::collections::{HashSet, BTreeMap};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use crate::ldap_filter;
use crate::ldap_wrapper::{LdapW, get_all_values};
use crate::my_err::{Result, MyErr};
use crate::my_types::{Mright};
use crate::remote_query::parse_sql_url;


pub type SharedExpirableCache<C> = Arc<Mutex<Option<(SystemTime, Arc<C>)>>>;

type RemoteToSgroupIds = BTreeMap<String, HashSet<String>>;

#[derive(Clone, Default)]
pub struct AllCaches {
    pub remote_to_sgroup_ids: SharedExpirableCache<RemoteToSgroupIds>,
}

pub fn clear<C>(cache: &SharedExpirableCache<C>) {
    *cache.lock().unwrap() = None;
}

fn get<C>(cache: &SharedExpirableCache<C>) -> Option<(SystemTime, Arc<C>)> {
    (*cache.lock().unwrap()).clone()
}

pub fn set<C>(cache: &SharedExpirableCache<C>, data: Arc<C>) {
    *cache.lock().unwrap() = Some((SystemTime::now(), data));
}

pub async fn get_remote_to_sgroup_ids(ldp: &mut LdapW<'_>, cache: &SharedExpirableCache<RemoteToSgroupIds>) -> Result<Arc<RemoteToSgroupIds>> {
    Ok(if let Some((_, r)) = get(&cache) {
        r
    } else {
        let attr = Mright::Member.to_attr_synchronized();
        let mut map = btreemap![];
        for entry in ldp.search_sgroups(&ldap_filter::presence(&attr), vec![&attr], None).await? {
        let sgroup_id = ldp.config.dn_to_sgroup_id(&entry.dn).ok_or(MyErr::Msg("internal error".to_owned()))?;
            let url = get_all_values(entry.attrs).pop().ok_or(MyErr::Msg("internal error".to_owned()))?;
            let remote = parse_sql_url(&url)?.ok_or(MyErr::Msg("internal error".to_owned()))?;
        map.entry(remote.remote_cfg_name).or_insert(hashset![]).insert(sgroup_id);
        }
        let r = Arc::new(map);
        set(&cache, Arc::clone(&r));
        r
    })
}

pub fn clear_all(all_caches: &AllCaches) {
    clear(&all_caches.remote_to_sgroup_ids);
}

