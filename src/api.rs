use ldap3::{Ldap, LdapResult};
use ldap3::result::Result;

use super::my_types::{Attrs, GroupKind, MyMods};
use super::my_ldap;


pub async fn create(ldap: &mut Ldap, kind: GroupKind, id: &str, attrs: Attrs) -> Result<LdapResult> {
    my_ldap::create(ldap, kind, id, attrs).await
}

pub async fn delete(ldap: &mut Ldap, id: &str) -> Result<LdapResult> {
    my_ldap::delete(ldap, id).await
}

pub async fn modify_members_or_rights(ldap: &mut Ldap, id: &str, my_mods: MyMods) -> Result<LdapResult> {
    my_ldap::modify_direct_members_or_rights(ldap, id, my_mods).await
    // TODO update indirect + propagate indirect
}

