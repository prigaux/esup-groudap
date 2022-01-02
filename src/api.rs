use ldap3::{LdapResult};
use ldap3::result::Result;

use super::my_types::{Attrs, GroupKind, MyMods};
use super::my_ldap;
use super::my_ldap::{LdapW};


pub async fn create(ldp: &mut LdapW<'_>, kind: GroupKind, id: &str, attrs: Attrs) -> Result<LdapResult> {
    my_ldap::create(ldp, kind, id, attrs).await
}

pub async fn delete(ldp: &mut LdapW<'_>, id: &str) -> Result<LdapResult> {
    my_ldap::delete(ldp, id).await
}

pub async fn modify_members_or_rights(ldp: &mut LdapW<'_>, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    my_ldap::modify_direct_members_or_rights(ldp, id, my_mods).await
    // TODO update indirect + propagate indirect
}

