use std::collections::{HashSet};
use ldap3::{Scope, SearchEntry, SearchOptions, Ldap};
use ldap3::result::{Result, LdapResult};
type LdapAttrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use super::my_types::*;
use super::ldap_wrapper::LdapW;
use super::my_ldap;
use super::my_ldap::{dn_to_url};
use super::api;

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

pub async fn clear<'a>(cfg_and_lu: &CfgAndLU<'a>) -> Result<LdapResult> {
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    let _res = ldp.ldap.delete("uid=aanli,ou=people,dc=nodomain").await;
    let _res = ldp.ldap.delete("uid=prigaux,ou=people,dc=nodomain").await;
    let _res = ldp.ldap.delete("ou=people,dc=nodomain").await;
    let _res = ldp.ldap.delete("cn=collab.DSIUN_SCD,ou=groups,dc=nodomain").await;
    let _res = ldp.ldap.delete("cn=collab.DSIUN,ou=groups,dc=nodomain").await;
    let _res = ldp.ldap.delete("cn=collab,ou=groups,dc=nodomain").await;
    let _res = ldp.ldap.delete("cn=applications.grouper.super-admins,ou=groups,dc=nodomain").await;
    let _res = ldp.ldap.delete("cn=applications.grouper,ou=groups,dc=nodomain").await;
    let _res = ldp.ldap.delete("cn=applications,ou=groups,dc=nodomain").await;
    let _res = ldp.ldap.delete("cn=ROOT,ou=groups,dc=nodomain").await;
    ldp.ldap.delete("ou=groups,dc=nodomain").await
    //ldap.delete("dc=nodomain").await
}

pub async fn add<'a>(cfg_and_lu: CfgAndLU<'a>) -> Result<LdapResult> {
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
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

    my_ldap::create_sgroup(ldp, GroupKind::STEM, "ROOT", btreemap!{ 
        Attr::Ou => "Racine".to_owned(),
        Attr::Description => "Droits sur l'arborescence entière".to_owned(),
    }).await?;
    my_ldap::modify_direct_members_or_rights(ldp, "ROOT", btreemap!{
        Mright::ADMIN => btreemap!{ MyMod::ADD => hashset![dn_to_url(&ldp.config.people_id_to_dn("prigaux"))] },
    }).await?;

    let cfg_and_prigaux = || CfgAndLU { user: LoggedUser::User("prigaux".to_owned()), ..cfg_and_lu };
    let cfg_and_aanli   = || CfgAndLU { user: LoggedUser::User("aanli".to_owned()), ..cfg_and_lu };

    let collab_attrs = || btreemap!{ 
        Attr::Ou => "Collaboration".to_owned(),
        Attr::Description => "Collaboration".to_owned(),
    };
    api::create(cfg_and_prigaux(), GroupKind::STEM, "collab", collab_attrs()).await?;
    let collab_dsiun_attrs = || btreemap!{
        Attr::Ou => "Collaboration DSIUN".to_owned(),
        Attr::Description => "Collaboration DSIUN".to_owned(),
    };
    api::create(cfg_and_prigaux(), GroupKind::GROUP, "collab.DSIUN", collab_dsiun_attrs()).await?;

    assert_eq!(api::get_sgroup(cfg_and_prigaux(), "collab").await?, 
               SgroupAndRight { right: Right::ADMIN, sgroup: SgroupOut { kind: GroupKind::STEM, attrs: collab_attrs() } });
    assert_eq!(api::get_sgroup(cfg_and_prigaux(), "collab.DSIUN").await?, 
               SgroupAndRight { right: Right::ADMIN, sgroup: SgroupOut { kind: GroupKind::GROUP, attrs: collab_dsiun_attrs() } });
    assert!(api::get_sgroup(cfg_and_aanli(), "collab.DSIUN").await.is_err());

    let res = api::modify_members_or_rights(cfg_and_prigaux(), "collab.DSIUN", btreemap!{
        Mright::UPDATER => btreemap!{ MyMod::ADD => hashset![dn_to_url(&ldp.config.people_id_to_dn("aanli"))] },
    }).await?;

    assert_eq!(api::get_sgroup(cfg_and_aanli(), "collab.DSIUN").await?, 
               SgroupAndRight { right: Right::UPDATER, sgroup: SgroupOut { kind: GroupKind::GROUP, attrs: collab_dsiun_attrs() } });

    api::create(cfg_and_prigaux(), GroupKind::STEM, "applications", btreemap!{ 
        Attr::Ou => "Applications".to_owned(),
        Attr::Description => "Applications".to_owned(),
    }).await?;

    api::create(cfg_and_prigaux(), GroupKind::STEM, "applications.grouper", btreemap!{ 
        Attr::Ou => "Grouper".to_owned(),
        Attr::Description => "Grouper".to_owned(),
    }).await?;

    api::create(cfg_and_prigaux(), GroupKind::GROUP, "applications.grouper.super-admins", btreemap!{
        Attr::Ou => "Grouper super admins".to_owned(),
        Attr::Description => "Grouper admins de toute l'arborescence".to_owned(),
    }).await?;
    api::modify_members_or_rights(cfg_and_prigaux(), "applications.grouper.super-admins", btreemap!{
        Mright::MEMBER => btreemap!{ MyMod::ADD => hashset![dn_to_url(&ldp.config.people_id_to_dn("prigaux"))] },
    }).await?;
    api::modify_members_or_rights(cfg_and_prigaux(), "ROOT", btreemap!{
        Mright::ADMIN => btreemap!{ 
            MyMod::DELETE => hashset![dn_to_url(&ldp.config.people_id_to_dn("prigaux"))],
            MyMod::ADD => hashset![dn_to_url(&ldp.config.sgroup_id_to_dn("applications.grouper.super-admins"))],
        },
    }).await?;

    //assert_eq!(api::get_sgroup(cfg_and_prigaux(), "collab").await?, 
    //    SgroupAndRight { right: Right::ADMIN, sgroup: SgroupOut { kind: GroupKind::STEM, attrs: collab_attrs() } });

    //api::create(cfg_and_prigaux(), GroupKind::GROUP, "collab.foo", btreemap!{
    //    Attr::Ou => "Collab Foo".to_owned(),
    //    Attr::Description => "Collab Foo".to_owned(),
    //}).await?;

    Ok(res)
}

pub async fn set<'a>(cfg_and_lu: CfgAndLU<'a>) -> Result<LdapResult> {
    clear(&cfg_and_lu).await?;
    add(cfg_and_lu).await
}

pub async fn _test_search(ldap: &mut Ldap) -> Result<String> {
    let opts = SearchOptions::new().sizelimit(1);
    let (mut rs, _res) = ldap.with_search_options(opts).search("dc=nodomain", Scope::Subtree, "(objectClass=person)", vec!["displayName"]).await?.success()?;
    let dn = if let Some(entry) = rs.pop() { SearchEntry::construct(entry).dn } else { "????".to_owned() };
    Ok(dn)
}
