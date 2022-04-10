use std::collections::{HashSet};
use ldap3::{Scope, SearchEntry, SearchOptions, Ldap, Mod};
use ldap3::result::{LdapResult};
type CreateLdapAttrs<'a> = Vec<(&'a str, HashSet<&'a str>)>;

use crate::my_types::*;
use crate::my_err::{Result};
use crate::ldap_wrapper::{LdapW};
use crate::ldap_filter;
use crate::remote_query;
use crate::my_ldap;
use crate::api_get;
use crate::api_post;

async fn ldap_add_ou_branch(ldap: &mut Ldap, ou: &str, description: &str) -> Result<LdapResult> {
    let dn = format!("ou={},dc=nodomain", ou);
    Ok(ldap.add(&dn, vec![
        ("objectClass", hashset!{"organizationalUnit"}),
        ("ou", hashset!{ou}),
        ("description", hashset!{description}),
    ]).await?)
}

fn sort(mut v : Vec<Dn>) -> Vec<Dn> {
    v.sort_unstable();
    v
}

async fn ldap_add_people(ldap: &mut Ldap, uid: &str, attrs: CreateLdapAttrs<'_>) -> Result<LdapResult> {
    let dn = format!("uid={},ou=people,dc=nodomain", uid);
    let all_attrs = [ vec![
        ("objectClass", hashset!{"inetOrgPerson", "shadowAccount"}),
        ("uid", hashset!{uid}),
    ], attrs ].concat();
    Ok(ldap.add(&dn, all_attrs).await?)
}

pub async fn clear(cfg_and_lu: &CfgAndLU<'_>) -> Result<()> {
    let ldp = &mut LdapW::open_(cfg_and_lu).await?;

    for user in [ "aanli", "prigaux" ] {
        let _res = ldp.ldap.delete(&ldp.config.people_id_to_dn(user).0).await; // ignore error
    }
    let _res = ldp.ldap.delete("ou=people,dc=nodomain").await; // ignore error
    let _res = ldp.ldap.delete("ou=admin,dc=nodomain").await; // ignore error

    if ldp.is_dn_existing(&Dn::from("ou=groups,dc=nodomain")).await? {
        eprintln!("deleting ou=groups entries");
        let ids = ldp.search_sgroups_id(ldap_filter::true_()).await?;
        for id in ids {
            if !id.is_empty() {
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

pub async fn add(cfg_and_lu: CfgAndLU<'_>) -> Result<()> {
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
    let prigaux_subject = || btreemap!{ prigaux_dn() => SubjectAttrs { 
        attrs: btreemap!{"displayName".to_owned() => "Pascal Rigaux".to_owned(), "uid".to_owned() => "prigaux".to_owned()},
        sgroup_id: None,
        options: DirectOptions::default(),
    } };

    ldp.ldap.modify(&ldp.config.sgroup_id_to_dn("").0, vec![
        Mod::Add("objectClass", hashset!["up1SyncGroup"])
    ]).await?;

    my_ldap::modify_direct_members_or_rights(ldp, "", &btreemap!{
        Mright::Admin => btreemap!{ MyMod::Add => hashmap![prigaux_dn() => DirectOptions::default()] },
    }).await?;

    let cfg_and_trusted = || CfgAndLU { user: LoggedUser::TrustedAdmin, ..cfg_and_lu };
    let cfg_and_prigaux = || CfgAndLU { user: LoggedUser::User("prigaux".to_owned()), ..cfg_and_lu };
    let cfg_and_aanli   = || CfgAndLU { user: LoggedUser::User("aanli".to_owned()), ..cfg_and_lu };

    let root_attrs = || btreemap![
        "description".to_owned() => "Groups. Droits sur l'arborescence entière".to_owned(),
        "ou".to_owned() => "Racine".to_owned(),
    ];
    let collab_attrs = || btreemap!{ 
        "ou".to_owned() => "Collaboration".to_owned(),
        "description".to_owned() => "Collaboration".to_owned(),
    };
    let to_parent = |id: &str, attrs, right| {
        SgroupOutAndRight { sgroup_id: id.to_owned(), attrs, right }
    };
    let root_with_id = |right| to_parent("", root_attrs(), right);
    let collab_with_id = |right| to_parent("collab.", collab_attrs(), right);
    api_post::create(cfg_and_prigaux(), "collab.", collab_attrs()).await?;
    let collab_dsiun_attrs = || btreemap!{
        "ou".to_owned() => "Collaboration DSIUN".to_owned(),
        "description".to_owned() => "Collaboration DSIUN".to_owned(),
    };
    api_post::create(cfg_and_prigaux(), "collab.DSIUN", collab_dsiun_attrs()).await?;

    let get_sgroup_collab = ||
        SgroupAndMoreOut { attrs: collab_attrs(), more: SgroupOutMore::Stem { 
            children: btreemap!{"collab.DSIUN".to_owned() => collab_dsiun_attrs()},
        }, parents: vec![ root_with_id(Some(Right::Admin)) ], right: Right::Admin };

    assert_eq!(api_get::get_sgroup(cfg_and_prigaux(), "").await?,
        SgroupAndMoreOut { attrs: root_attrs(), more: SgroupOutMore::Stem { children: btreemap!{
            "collab.".to_owned() => collab_attrs(),
        } }, parents: vec![], right: Right::Admin }
    );
    assert_eq!(api_get::get_sgroup(cfg_and_prigaux(), "collab.").await?, get_sgroup_collab());
    assert_eq!(api_get::get_sgroup(cfg_and_prigaux(), "collab.DSIUN").await?, 
               SgroupAndMoreOut { right: Right::Admin, more: SgroupOutMore::Group { direct_members: btreemap!{} }, parents: vec![ 
                   root_with_id(Some(Right::Admin)), collab_with_id(Some(Right::Admin)) 
               ], attrs: collab_dsiun_attrs() });
    assert!(api_get::get_sgroup(cfg_and_aanli(), "collab.DSIUN").await.is_err());

    api_post::modify_members_or_rights(cfg_and_prigaux(), "collab.DSIUN", btreemap!{
        Mright::Member => btreemap!{ MyMod::Add => hashmap![prigaux_dn() => DirectOptions::default()] },
        Mright::Updater => btreemap!{ MyMod::Add => hashmap![aanli_dn() => DirectOptions::default()] },
    }, &None).await?;

    assert_eq!(api_get::get_sgroup(cfg_and_aanli(), "collab.DSIUN").await?, 
               SgroupAndMoreOut { right: Right::Updater, more: SgroupOutMore::Group { direct_members: prigaux_subject() }, parents: vec![ 
                   root_with_id(None), collab_with_id(None),
               ], attrs: collab_dsiun_attrs() });

    api_post::create(cfg_and_prigaux(), "applications.", btreemap!{ 
        "ou".to_owned() => "Applications".to_owned(),
        "description".to_owned() => "Applications".to_owned(),
    }).await?;

    api_post::create(cfg_and_prigaux(), "applications.grouper.", btreemap!{ 
        "ou".to_owned() => "Applications:Grouper".to_owned(),
        "description".to_owned() => "Grouper".to_owned(),
    }).await?;

    api_post::create(cfg_and_prigaux(), "applications.grouper.super-admins", btreemap!{
        "ou".to_owned() => "Grouper super admins".to_owned(),
        "description".to_owned() => "Grouper admins de toute l'arborescence\n\nTicket truc".to_owned(),
    }).await?;
    api_post::modify_members_or_rights(cfg_and_prigaux(), "applications.grouper.super-admins", btreemap!{
        Mright::Member => btreemap!{ MyMod::Add => hashmap![prigaux_dn() => DirectOptions::default()] },
    }, &None).await?;
    assert_eq!(ldp.read_flattened_mright(&ldp.config.sgroup_id_to_dn("applications.grouper.super-admins"), Mright::Member).await?, vec![prigaux_dn()]);

    api_post::modify_members_or_rights(cfg_and_prigaux(), "", btreemap!{
        Mright::Admin => btreemap!{ 
            MyMod::Delete => hashmap![prigaux_dn() => DirectOptions::default()],
            MyMod::Add => hashmap![ldp.config.sgroup_id_to_dn("applications.grouper.super-admins") => DirectOptions::default()],
        },
    }, &None).await?;

    // prigaux is still admin... via group "super-admins"
    assert_eq!(api_get::get_sgroup(cfg_and_prigaux(), "collab.").await?, 
        SgroupAndMoreOut { right: Right::Admin, more: SgroupOutMore::Stem { 
            children: btreemap!{"collab.DSIUN".to_owned() => collab_dsiun_attrs()}
        }, parents: vec![ root_with_id(Some(Right::Admin)) ], attrs: collab_attrs() });

    let collab_foo_attrs = || btreemap!{
        "ou".to_owned() => "Collab Foo".to_owned(),
        "description".to_owned() => "Collab Foo".to_owned(),
    };
    api_post::create(cfg_and_prigaux(), "collab.foo", collab_foo_attrs()).await?;
    api_post::modify_members_or_rights(cfg_and_prigaux(), "collab.foo", btreemap!{
        Mright::Admin => btreemap!{ MyMod::Add => hashmap![ldp.config.sgroup_id_to_dn("collab.DSIUN") => DirectOptions::default()] },
    }, &None).await?;
    assert_eq!(sort(ldp.read_flattened_mright(&ldp.config.sgroup_id_to_dn("collab.foo"), Mright::Admin).await?), vec![
        ldp.config.sgroup_id_to_dn("collab.DSIUN"), prigaux_dn(),
    ]);
    //let remote_sql_query = || remote_query::parse_sql_url("sql: remote=foo : subject=ou=people,dc=nodomain?uid : select username from users").unwrap().unwrap();
    //api_post::modify_remote_sql_query(&Default::default(), cfg_and_prigaux(), "collab.foo", remote_sql_query(), &None).await?;
    //assert_eq!(api_get::get_sgroup(cfg_and_prigaux(), "collab.foo").await?,
    //    SgroupAndMoreOut { 
    //        attrs: collab_foo_attrs(), more: SgroupOutMore::SynchronizedGroup { remote_sql_query: remote_sql_query() }, 
    //        parents: vec![ 
    //            root_with_id(Some(Right::Admin)), collab_with_id(Some(Right::Admin)) 
    //        ], right: Right::Admin }
    //);

    eprintln!(r#"remove last "member". Need to put an empty member back"#);
    api_post::modify_members_or_rights(cfg_and_prigaux(), "applications.grouper.super-admins", btreemap!{
        Mright::Member => btreemap!{ MyMod::Delete => hashmap![prigaux_dn() => DirectOptions::default()] },
    }, &None).await?;
    assert_eq!(ldp.read_one_multi_attr__or_err(&ldp.config.sgroup_id_to_dn("applications.grouper.super-admins"), "member").await?, vec![""]);
    eprintln!(r#"prigaux is no more admin..."#);
    assert!(api_get::get_sgroup(cfg_and_prigaux(), "collab.").await.is_err());

    eprintln!(r#"add group in group "super-admins""#);
    api_post::modify_members_or_rights(cfg_and_trusted(), "applications.grouper.super-admins", btreemap!{
        Mright::Member => btreemap!{ MyMod::Add => hashmap![ldp.config.sgroup_id_to_dn("collab.DSIUN") => DirectOptions { enddate: Some("20991231000000Z".to_owned()) }] },
    }, &None).await?;
    assert_eq!(HashSet::from_iter(ldp.read_flattened_mright(&ldp.config.sgroup_id_to_dn("applications.grouper.super-admins"), Mright::Member).await?), 
               hashset![ prigaux_dn(), ldp.config.sgroup_id_to_dn("collab.DSIUN") ]);
    eprintln!(r#"prigaux shoud be admin via stem "" via applications.grouper.super-admins via collab.DSIUN"#);
    assert_eq!(api_get::get_sgroup(cfg_and_prigaux(), "collab.").await?, 
        SgroupAndMoreOut { attrs: collab_attrs(), more: SgroupOutMore::Stem { children: btreemap!{
            "collab.DSIUN".to_owned() => collab_dsiun_attrs(),
            "collab.foo".to_owned() => collab_foo_attrs(),
        } }, parents: vec![ root_with_id(Some(Right::Admin)) ], right: Right::Admin }
    );
    assert_eq!(api_get::mygroups(cfg_and_prigaux()).await?, btreemap![
        "collab.foo".to_owned() => collab_foo_attrs(),
    ]);
    assert_eq!(api_get::mygroups(cfg_and_aanli()).await?, btreemap!{
        "collab.DSIUN".to_owned() => collab_dsiun_attrs(),
    });

    assert_eq!(api_get::search_sgroups(cfg_and_prigaux(), Right::Reader, "collaboration".to_owned(), 99).await?, btreemap![
        "collab.DSIUN".to_owned() => collab_dsiun_attrs(),
    ]);
    assert_eq!(api_get::search_sgroups(cfg_and_prigaux(), Right::Admin, "collaboration".to_owned(), 99).await?, btreemap![
        "collab.DSIUN".to_owned() => collab_dsiun_attrs(),
    ]);
    assert_eq!(api_get::search_sgroups(cfg_and_aanli(), Right::Updater, "collaboration".to_owned(), 99).await?, btreemap![
        "collab.DSIUN".to_owned() => collab_dsiun_attrs(),
    ]);
    assert_eq!(api_get::search_sgroups(cfg_and_aanli(), Right::Admin, "collaboration".to_owned(), 99).await?, btreemap![
    ]);

    assert_eq!(api_get::get_group_flattened_mright(cfg_and_prigaux(), "collab.DSIUN", Mright::Member, None, Some(1)).await?, 
        SubjectsAndCount { count: 1, subjects: prigaux_subject() });

    assert!(api_get::get_group_flattened_mright(cfg_and_prigaux(), "", Mright::Admin, None, None).await.is_err());
    assert!(api_get::get_group_flattened_mright(cfg_and_prigaux(), "collab.", Mright::Admin, None, None).await.is_err());

    Ok(())
}

pub async fn set(cfg_and_lu: CfgAndLU<'_>) -> Result<()> {
    clear(&cfg_and_lu).await?;
    add(cfg_and_lu).await
}

pub async fn _test_search(ldap: &mut Ldap) -> Result<String> {
    let opts = SearchOptions::new().sizelimit(1);
    let (mut rs, _res) = ldap.with_search_options(opts).search("dc=nodomain", Scope::Subtree, "(objectClass=person)", vec!["displayName"]).await?.success()?;
    let dn = if let Some(entry) = rs.pop() { SearchEntry::construct(entry).dn } else { "????".to_owned() };
    Ok(dn)
}
