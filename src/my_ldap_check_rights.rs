use std::collections::HashSet;

use crate::my_types::{Right, LoggedUser};
use crate::my_err::{MyErr, Result};
use crate::ldap_filter;
use crate::ldap_wrapper::LdapW;
use crate::my_ldap::{user_urls_, user_has_right_on_sgroup_filter};


pub async fn user_has_right_on_at_least_one_sgroups(ldp: &mut LdapW<'_>, user_urls: &HashSet<String>, ids: Vec<&str>, right: &Right) -> Result<bool> {    
    let ids_filter = ldap_filter::or(ids.into_iter().map(|id| ldp.config.sgroup_filter(id)).collect());
    let filter = ldap_filter::and2(
        &ids_filter,
        &user_has_right_on_sgroup_filter(user_urls, right),
    );
    
    //user_has_right_on_sgroup_filter(right);
    Ok(ldp.one_group_matches_filter(&filter).await?)
}

/*async fn user_has_right_on_group(ldp: &mut LdapW<'_>, user: &str, id: &str, right: &Right) -> Result<bool> {    
    let filter = user_has_direct_right_on_group_filter(&ldp.config.people_id_to_dn(user), right);
    ldp.is_sgroup_matching_filter(id, &filter).await
}*/

pub async fn check_right_on_any_parents(ldp: &mut LdapW<'_>, id: &str, right: Right) -> Result<()> {
    match ldp.logged_user {
        LoggedUser::TrustedAdmin => {
            if let Some(parent_stem) = ldp.config.stem.parent_stem(id) {
                if !ldp.is_sgroup_existing(parent_stem).await? { 
                    return Err(MyErr::Msg(format!("stem {} does not exist", parent_stem)))
                }    
            }
            Ok(())
        },
        LoggedUser::User(user) => {
            eprintln!("  check_right_on_any_parents({}, {:?})", id, right);
            let user_urls = user_urls_(ldp, user).await?;
            let parents = ldp.config.stem.parent_stems(id);
            if user_has_right_on_at_least_one_sgroups(ldp, &user_urls, parents, &right).await? {
                Ok(())
            } else {
                Err(MyErr::Msg(format!("no right on {} parents", id)))
            }
        }
    }
}

pub async fn check_right_on_self_or_any_parents(ldp: &mut LdapW<'_>, id: &str, right: Right) -> Result<()> {
    match ldp.logged_user {
        LoggedUser::TrustedAdmin => {
            Ok(())
        },
        LoggedUser::User(user) => {
            eprintln!("  check_right_on_self_or_any_parents({}, {:?})", id, right);
            let user_urls = user_urls_(ldp, user).await?;
            let self_and_parents = [
                vec![id],
                ldp.config.stem.parent_stems(id),
            ].concat();
            if user_has_right_on_at_least_one_sgroups(ldp, &user_urls, self_and_parents, &right).await? {
                Ok(())
            } else {
                Err(MyErr::Msg(format!("no right on {}", id)))
            }
        }
    }
}

