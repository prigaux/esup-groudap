use std::collections::{HashSet};
use ldap3::{Scope, SearchEntry, SearchOptions, Ldap, Mod};
use ldap3::result::{Result, LdapResult};
type LdapAttrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use crate::my_types::*;
use crate::ldap_wrapper::LdapW;
use crate::ldap_filter;
use crate::my_ldap;
use crate::my_ldap::{dn_to_url};
use crate::api;

async fn ldap_add_ou_branch(ldap: &mut Ldap, ou: &str, description: &str) -> Result<LdapResult> {
    let dn = format!("ou={},dc=nodomain", ou);
    ldap.add(&dn, vec![
        ("objectClass", hashset!{"organizationalUnit"}),
        ("ou", hashset!{ou}),
        ("description", hashset!{description}),
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

pub async fn clear<'a>(cfg_and_lu: &CfgAndLU<'a>) -> Result<()> {
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;

    for user in [ "aanli", "prigaux" ] {
        let _res = ldp.ldap.delete(&ldp.config.people_id_to_dn(user)).await; // ignore error
    }
    let _res = ldp.ldap.delete("ou=people,dc=nodomain").await; // ignore error
    let _res = ldp.ldap.delete("ou=admin,dc=nodomain").await; // ignore error

    if ldp.is_dn_existing("ou=groups,dc=nodomain").await? {
        eprintln!("deleting ou=groups entries");
        let ids = ldp.search_sgroups_id(ldap_filter::true_()).await?;
        for id in ids {
            if id != "" {
                ldp.delete_sgroup(&id).await?;
            }
        }   
        eprintln!("deleting ou=groups");
        ldp.ldap.delete("ou=groups,dc=nodomain").await?;
    }
    Ok(())
    // not deleting the root dc since it causes havoc in openldap...
    //ldap.delete("dc=nodomain").await
}

pub async fn add<'a>(cfg_and_lu: CfgAndLU<'a>) -> Result<()> {
    let ldp = &mut LdapW::open_(&cfg_and_lu).await?;
    ldp.ldap.add("dc=nodomain", vec![
        ("objectClass", hashset!{"dcObject", "organization"}),
        ("dc", hashset!{"nodomain"}),
        ("o", hashset!{"nodomain"}),
    ]).await?;
    ldap_add_ou_branch(&mut ldp.ldap, "people", "Users").await?;
    ldap_add_ou_branch(&mut ldp.ldap, "admin", "Applications").await?;
    ldap_add_ou_branch(&mut ldp.ldap, "groups", "Groups. Droits sur l'arborescence entière").await?;
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

    let prigaux_dn = || ldp.config.people_id_to_dn("prigaux");
    let aanli_dn = || ldp.config.people_id_to_dn("aanli");
    let prigaux_subject = || btreemap!{ prigaux_dn() => btreemap!{"displayName".to_owned() => "Pascal Rigaux".to_owned(), "uid".to_owned() => "prigaux".to_owned()} };

    ldp.ldap.modify(&ldp.config.sgroup_id_to_dn(""), vec![
        Mod::Add("objectClass", hashset!["up1SyncGroup"])
    ]).await?;

    my_ldap::modify_direct_members_or_rights(ldp, "", btreemap!{
        Mright::ADMIN => btreemap!{ MyMod::ADD => hashset![dn_to_url(&prigaux_dn())] },
    }).await?;

    let cfg_and_trusted = || CfgAndLU { user: LoggedUser::TrustedAdmin, ..cfg_and_lu };
    let cfg_and_prigaux = || CfgAndLU { user: LoggedUser::User("prigaux".to_owned()), ..cfg_and_lu };
    let cfg_and_aanli   = || CfgAndLU { user: LoggedUser::User("aanli".to_owned()), ..cfg_and_lu };

    let collab_attrs = || btreemap!{ 
        Attr::Ou => "Collaboration".to_owned(),
        Attr::Description => "Collaboration".to_owned(),
    };
    api::create(cfg_and_prigaux(), "collab.", collab_attrs()).await?;
    let collab_dsiun_attrs = || btreemap!{
        Attr::Ou => "Collaboration DSIUN".to_owned(),
        Attr::Description => "Collaboration DSIUN".to_owned(),
    };
    api::create(cfg_and_prigaux(), "collab.DSIUN", collab_dsiun_attrs()).await?;

    let get_sgroup_collab = ||
        SgroupAndMoreOut { attrs: collab_attrs(), more: SgroupOutMore::Stem { children: btreemap!{"collab.DSIUN".to_owned() => collab_dsiun_attrs()} }, right: Right::ADMIN };

    assert_eq!(api::get_sgroup(cfg_and_prigaux(), "collab.").await?, get_sgroup_collab());
    assert_eq!(api::get_sgroup(cfg_and_prigaux(), "collab.DSIUN").await?, 
               SgroupAndMoreOut { right: Right::ADMIN, more: SgroupOutMore::Group { direct_members: btreemap!{} }, attrs: collab_dsiun_attrs() });
    assert!(api::get_sgroup(cfg_and_aanli(), "collab.DSIUN").await.is_err());

    api::modify_members_or_rights(cfg_and_prigaux(), "collab.DSIUN", btreemap!{
        Mright::MEMBER => btreemap!{ MyMod::ADD => hashset![dn_to_url(&prigaux_dn())] },
        Mright::UPDATER => btreemap!{ MyMod::ADD => hashset![dn_to_url(&aanli_dn())] },
    }).await?;

    assert_eq!(api::get_sgroup(cfg_and_aanli(), "collab.DSIUN").await?, 
               SgroupAndMoreOut { right: Right::UPDATER, more: SgroupOutMore::Group { direct_members: prigaux_subject() }, attrs: collab_dsiun_attrs() });

    api::create(cfg_and_prigaux(), "applications.", btreemap!{ 
        Attr::Ou => "Applications".to_owned(),
        Attr::Description => "Applications".to_owned(),
    }).await?;

    api::create(cfg_and_prigaux(), "applications.grouper.", btreemap!{ 
        Attr::Ou => "Grouper".to_owned(),
        Attr::Description => "Grouper".to_owned(),
    }).await?;

    api::create(cfg_and_prigaux(), "applications.grouper.super-admins", btreemap!{
        Attr::Ou => "Grouper super admins".to_owned(),
        Attr::Description => "Grouper admins de toute l'arborescence".to_owned(),
    }).await?;
    api::modify_members_or_rights(cfg_and_prigaux(), "applications.grouper.super-admins", btreemap!{
        Mright::MEMBER => btreemap!{ MyMod::ADD => hashset![dn_to_url(&prigaux_dn())] },
    }).await?;
    assert_eq!(ldp.read_flattened_mright(&ldp.config.sgroup_id_to_dn("applications.grouper.super-admins"), Mright::MEMBER).await?, vec![prigaux_dn()]);

    api::modify_members_or_rights(cfg_and_prigaux(), "", btreemap!{
        Mright::ADMIN => btreemap!{ 
            MyMod::DELETE => hashset![dn_to_url(&prigaux_dn())],
            MyMod::ADD => hashset![dn_to_url(&ldp.config.sgroup_id_to_dn("applications.grouper.super-admins"))],
        },
    }).await?;

    // prigaux is still admin... via group "super-admins"
    assert_eq!(api::get_sgroup(cfg_and_prigaux(), "collab.").await?, 
        SgroupAndMoreOut { right: Right::ADMIN, more: SgroupOutMore::Stem { children: btreemap!{"collab.DSIUN".to_owned() => collab_dsiun_attrs()} }, attrs: collab_attrs() });

    let collab_foo_attrs = || btreemap!{
        Attr::Ou => "Collab Foo".to_owned(),
        Attr::Description => "Collab Foo".to_owned(),
    };
    api::create(cfg_and_prigaux(), "collab.foo", collab_foo_attrs()).await?;

    eprintln!(r#"remove last "member". Need to put an empty member back"#);
    api::modify_members_or_rights(cfg_and_prigaux(), "applications.grouper.super-admins", btreemap!{
        Mright::MEMBER => btreemap!{ MyMod::DELETE => hashset![dn_to_url(&prigaux_dn())] },
    }).await?;
    assert_eq!(ldp.read_one_multi_attr__or_err(&ldp.config.sgroup_id_to_dn("applications.grouper.super-admins"), "member").await?, vec![""]);
    eprintln!(r#"prigaux is no more admin..."#);
    assert!(api::get_sgroup(cfg_and_prigaux(), "collab.").await.is_err());

    eprintln!(r#"add group in group "super-admins""#);
    api::modify_members_or_rights(cfg_and_trusted(), "applications.grouper.super-admins", btreemap!{
        Mright::MEMBER => btreemap!{ MyMod::ADD => hashset![dn_to_url(&ldp.config.sgroup_id_to_dn("collab.DSIUN"))] },
    }).await?;
    assert_eq!(HashSet::from_iter(ldp.read_flattened_mright(&ldp.config.sgroup_id_to_dn("applications.grouper.super-admins"), Mright::MEMBER).await?), 
               hashset![ prigaux_dn(), ldp.config.sgroup_id_to_dn("collab.DSIUN") ]);
    eprintln!(r#"prigaux shoud be admin via stem "" via applications.grouper.super-admins via collab.DSIUN"#);
    assert_eq!(api::get_sgroup(cfg_and_prigaux(), "collab.").await?, 
        SgroupAndMoreOut { attrs: collab_attrs(), more: SgroupOutMore::Stem { children: btreemap!{
            "collab.DSIUN".to_owned() => collab_dsiun_attrs(),
            "collab.foo".to_owned() => collab_foo_attrs(),
        } }, right: Right::ADMIN }
    );

    Ok(())
}

pub async fn set<'a>(cfg_and_lu: CfgAndLU<'a>) -> Result<()> {
    clear(&cfg_and_lu).await?;
    add(cfg_and_lu).await
}

pub async fn _test_search(ldap: &mut Ldap) -> Result<String> {
    let opts = SearchOptions::new().sizelimit(1);
    let (mut rs, _res) = ldap.with_search_options(opts).search("dc=nodomain", Scope::Subtree, "(objectClass=person)", vec!["displayName"]).await?.success()?;
    let dn = if let Some(entry) = rs.pop() { SearchEntry::construct(entry).dn } else { "????".to_owned() };
    Ok(dn)
}
