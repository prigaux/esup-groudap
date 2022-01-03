use std::collections::{HashSet};
use ldap3::{Scope, SearchEntry, SearchOptions, Ldap};
use ldap3::result::{Result, LdapResult};
type LdapAttrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use super::my_types::{GroupKind, Mright, MyMod, Attr};
use super::ldap_wrapper::{LdapW};
use super::my_ldap;
use super::my_ldap::{people_id_to_dn, sgroup_id_to_dn, dn_to_url};

async fn ldap_add_ou_branch(ldap: &mut Ldap, ou: &str) -> Result<LdapResult> {
    let dn = format!("ou={},dc=nodomain", ou);
    ldap.add(&dn, vec![
        ("objectClass", hashset!{"organizationalUnit"}),
        ("ou", hashset!{ou}),
    ]).await
}

async fn ldap_add_people(ldap: &mut Ldap, uid: &str, attrs: LdapAttrs<'_>) -> Result<LdapResult> {
    let dn = format!("uid={},ou=people,dc=nodomain", uid);
    let all_attrs = [ vec![
        ("objectClass", hashset!{"inetOrgPerson", "shadowAccount"}),
        ("uid", hashset!{uid}),
    ], attrs ].concat();
    ldap.add(&dn, all_attrs).await
}

pub async fn clear(ldp : &mut LdapW<'_>) -> Result<LdapResult> {
    let _res = ldp.ldap.delete("uid=aanli,ou=people,dc=nodomain").await;
    let _res = ldp.ldap.delete("uid=prigaux,ou=people,dc=nodomain").await;
    let _res = ldp.ldap.delete("ou=people,dc=nodomain").await;
    let _res = ldp.ldap.delete("cn=collab.DSIUN_SCD,ou=groups,dc=nodomain").await;
    let _res = ldp.ldap.delete("cn=collab,ou=groups,dc=nodomain").await;
    let _res = ldp.ldap.delete("cn=ROOT,ou=groups,dc=nodomain").await;
    ldp.ldap.delete("ou=groups,dc=nodomain").await
    //ldap.delete("dc=nodomain").await
}

pub async fn add(ldp : &mut LdapW<'_>) -> Result<LdapResult> {
    ldp.ldap.add("dc=nodomain", vec![
        ("objectClass", hashset!{"dcObject", "organization"}),
        ("dc", hashset!{"nodomain"}),
        ("o", hashset!{"nodomain"}),
    ]).await?;
    ldap_add_ou_branch(&mut ldp.ldap, "people").await?;
    ldap_add_ou_branch(&mut ldp.ldap, "groups").await?;
    ldap_add_people(&mut ldp.ldap, "prigaux", vec![
        ("cn", hashset!{"Rigaux Pascal"}),
        ("displayName", hashset!{"Pascal Rigaux"}),
        ("sn", hashset!{"Rigaux"}),
    ]).await?;
    ldap_add_people(&mut ldp.ldap, "aanli", vec![
        ("cn", hashset!{"Anli Aymar"}),
        ("displayName", hashset!{"Aymar Anli"}),
        ("sn", hashset!{"Anli"}),
    ]).await?;

    my_ldap::create(ldp, GroupKind::STEM, "ROOT", btreemap!{ 
        Attr::Ou => "Racine".to_owned(),
        Attr::Description => "Droits sur l'arborescence entière".to_owned(),
    }).await?;
    my_ldap::modify_direct_members_or_rights(ldp, "ROOT", btreemap!{
        Mright::ADMIN => btreemap!{ MyMod::ADD => hashset![dn_to_url(&people_id_to_dn(&ldp.config, "prigaux"))] },
    }).await?;

    my_ldap::create(ldp, GroupKind::STEM, "collab", btreemap!{ 
        Attr::Ou => "Collaboration".to_owned(),
        Attr::Description => "Collaboration".to_owned(),
    }).await?;

    my_ldap::create(ldp, GroupKind::GROUP, "collab.DSIUN_SCD", btreemap!{
        Attr::Ou => "Collaboration DSIUN SCD".to_owned(),
        Attr::Description => "Collaboration DSIUN SCD".to_owned(),
    }).await?;

    let res = my_ldap::modify_direct_members_or_rights(ldp, "collab.DSIUN_SCD", btreemap!{
        Mright::UPDATER => btreemap!{ MyMod::ADD => hashset![dn_to_url(&people_id_to_dn(&ldp.config, "aanli"))] },
    }).await?;

    my_ldap::create(ldp, GroupKind::STEM, "applications", btreemap!{ 
        Attr::Ou => "Applications".to_owned(),
        Attr::Description => "Applications".to_owned(),
    }).await?;

    my_ldap::create(ldp, GroupKind::STEM, "applications.grouper", btreemap!{ 
        Attr::Ou => "Grouper".to_owned(),
        Attr::Description => "Grouper".to_owned(),
    }).await?;

    my_ldap::create(ldp, GroupKind::GROUP, "applications.grouper.super-admins", btreemap!{
        Attr::Ou => "Grouper super admins".to_owned(),
        Attr::Description => "Grouper admins de toute l'arborescence".to_owned(),
    }).await?;
    my_ldap::modify_direct_members_or_rights(ldp, "applications.grouper.super-admins", btreemap!{
        Mright::MEMBER => btreemap!{ MyMod::ADD => hashset![dn_to_url(&people_id_to_dn(&ldp.config, "prigaux"))] },
    }).await?;
    my_ldap::modify_direct_members_or_rights(ldp, "ROOT", btreemap!{
        Mright::ADMIN => btreemap!{ 
            MyMod::DELETE => hashset![dn_to_url(&people_id_to_dn(&ldp.config, "prigaux"))],
            MyMod::ADD => hashset![dn_to_url(&sgroup_id_to_dn(&ldp.config, "applications.grouper.super-admins"))],
        },
    }).await?;

    Ok(res)
}

pub async fn set(ldp : &mut LdapW<'_>) -> Result<LdapResult> {
    let _res = clear(ldp).await;
    add(ldp).await
}

pub async fn _test_search(ldap: &mut Ldap) -> Result<String> {
    let opts = SearchOptions::new().sizelimit(1);
    let (mut rs, _res) = ldap.with_search_options(opts).search("dc=nodomain", Scope::Subtree, "(objectClass=person)", vec!["displayName"]).await?.success()?;
    let dn = if let Some(entry) = rs.pop() { SearchEntry::construct(entry).dn } else { "????".to_owned() };
    Ok(dn)
}
