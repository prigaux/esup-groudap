import * as assert from 'assert';
import * as ldapjs from 'ldapjs'
import * as ldapP from 'ldapjs-promise-disconnectwhenidle'

import * as ldp from "./ldap_read_search"
import * as ldpSgroup from './ldap_sgroup_read_search_modify'
import * as api_post from './api_post'
import * as api_get from './api_get'
import ldap_filter from './ldap_filter'
import { people_id_to_dn, sgroup_id_to_dn } from './dn'
import { LdapRawValue } from './ldap_helpers';
import { LoggedUser, MonoAttrs, Option, Right, SgroupAndMoreOut, Subjects, toDn } from './my_types'


async function ldap_add_ou_branch(ou: string, description: string) {
    const dn = `ou=${ou},dc=nodomain`
    await ldapP.add(dn, { objectClass: "organizationalUnit", ou, description })
}

async function ldap_add_people(uid: string, attrs: Record<string, LdapRawValue>) {
    const dn = `uid=${uid},ou=people,dc=nodomain`
    const all_attrs = {
        objectClass: ["inetOrgPerson", "shadowAccount"],
        uid: [uid],
        ...attrs,
    }
    await ldapP.add(dn, all_attrs)
}

async function ignore_error(p: Promise<void>) {
    try {
        await p;
    } catch {
        // ignore
    }
}

export async function clear() {

    for (const user of [ "aanli", "prigaux" ]) {
        await ignore_error(ldapP.del(people_id_to_dn(user)))
    }
    await ignore_error(ldapP.del("ou=people,dc=nodomain"))
    await ignore_error(ldapP.del("ou=admin,dc=nodomain"))

    if (await ldp.is_dn_existing(toDn("ou=groups,dc=nodomain"))) {
        console.log("deleting ou=groups entries");
        const ids = await ldpSgroup.search_sgroups_id(ldap_filter.true_())
        for (const id of ids) {
            if (id !== '') await ldpSgroup.delete_sgroup(id)
        }
        console.log("deleting ou=groups")
        await ldapP.del("ou=groups,dc=nodomain")
    }
    // not deleting the root dc since it causes havoc in openldap...
    //ldap.delete("dc=nodomain").await
}

export async function add() {
    await ignore_error(ldapP.add("dc=nodomain", {
        objectClass: ["dcObject", "organization"],
        dc: "nodomain",
        o: "nodomain",
    }))
    await ldap_add_ou_branch("people", "Users");
    await ldap_add_ou_branch("admin", "Applications");
    await ldap_add_ou_branch("groups", "Groups. Droits sur l'arborescence entière");
    await ldap_add_people("prigaux", {
        cn: "Rigaux Pascal",
        displayName: "Pascal Rigaux",
        sn: "Rigaux",
    })
    await ldap_add_people("aanli", {
        cn: "Anli Aymar",
        displayName: "Aymar Anli",
        sn: "Anli",
    })

    const prigaux_dn = people_id_to_dn("prigaux")
    const aanli_dn = people_id_to_dn("aanli")
    const prigaux_subject: Subjects = { [prigaux_dn]: { 
        attrs: {displayName: "Pascal Rigaux", uid: "prigaux"},
        options: {},
        sgroup_id: undefined,
    } }

    await ldapP.modify(sgroup_id_to_dn(""), new ldapjs.Change({
        operation: 'add', modification: { objectClass: "groupaldGroup" }
    }))

    const user_trusted : LoggedUser = { TrustedAdmin: true }
    const user_prigaux : LoggedUser = { User: "prigaux" }
    const user_aanli   : LoggedUser = { User: "aanli" }

    await api_post.modify_members_or_rights(user_trusted, "", {
        admin: { add: { [prigaux_dn]: {} } },
    }, undefined)

    const root_attrs = {
        description: "Groups. Droits sur l'arborescence entière",
        ou: "Racine",
    }
    const collab_attrs = {
        ou: "Collaboration",
        description: "Collaboration",
    }
    const to_parent = (id: string, attrs: MonoAttrs, right: Option<Right>) => (
        { sgroup_id: id, attrs, right }
    )
    const root_with_id = (right: Option<Right>) => to_parent("", root_attrs, right);
    const collab_with_id = (right: Option<Right>) => to_parent("collab.", collab_attrs, right);
    await api_post.create(user_prigaux, "collab.", collab_attrs)
    const collab_dsiun_attrs = {
        ou: "Collaboration DSIUN",
        description: "Collaboration DSIUN",
    };
    await api_post.create(user_prigaux, "collab.DSIUN", collab_dsiun_attrs)

    const get_sgroup_collab: SgroupAndMoreOut = { 
        attrs: collab_attrs, 
        stem: { 
            children: {"collab.DSIUN": collab_dsiun_attrs},
        }, 
        parents: [ root_with_id('admin') ], right: 'admin',
    };

    assert.deepEqual(await api_get.get_sgroup(user_prigaux, ""), { 
        attrs: root_attrs, 
        stem: { children: { "collab.": collab_attrs, } }, 
        parents: [], right: 'admin',
    });
    assert.deepEqual(await api_get.get_sgroup(user_prigaux, "collab."), get_sgroup_collab);
    assert.deepEqual(await api_get.get_sgroup(user_prigaux, "collab.DSIUN"), { 
        right: 'admin', 
        group: { direct_members: {} },
        parents: [ root_with_id('admin'), collab_with_id('admin') ], 
        attrs: collab_dsiun_attrs,
    });
    await assert.rejects(api_get.get_sgroup(user_aanli, "collab.DSIUN"))

    await api_post.modify_members_or_rights(user_prigaux, "collab.DSIUN", {
        member: { add: { [prigaux_dn]: {} } },
        updater: { add: { [aanli_dn]: {} } },
    }, undefined)

    assert.deepEqual((await api_get.get_sgroup(user_aanli, "collab.DSIUN")), { 
        right: 'updater', 
        group: { direct_members: prigaux_subject }, 
        parents: [ root_with_id(undefined), collab_with_id(undefined) ], 
        attrs: collab_dsiun_attrs,
    });

    await api_post.create(user_prigaux, "applications.", { 
        ou: "Applications",
        description: "Applications",
    })

    await api_post.create(user_prigaux, "applications.grouper.", { 
        ou: "Applications:Grouper",
        description: "Grouper",
    })

    await api_post.create(user_prigaux, "applications.grouper.super-admins", {
        ou: "Grouper super admins",
        description: "Grouper admins de toute l'arborescence\n\nTicket truc",
    })
    await api_post.modify_members_or_rights(user_prigaux, "applications.grouper.super-admins", {
        member: { add: { [prigaux_dn]: {} } },
    }, undefined)
    assert.deepEqual(await ldp.read_flattened_mright(sgroup_id_to_dn("applications.grouper.super-admins"), 'member'), [prigaux_dn]);

    await api_post.modify_members_or_rights(user_prigaux, "", {
        admin: { 
            delete: { [prigaux_dn]: {} },
            add: { [sgroup_id_to_dn("applications.grouper.super-admins")]: {} },
        },
    }, undefined);

    // prigaux is still admin... via group "super-admins"
    assert.deepEqual(await api_get.get_sgroup(user_prigaux, "collab."), { 
        right: 'admin', 
        stem: { children: {"collab.DSIUN": collab_dsiun_attrs} }, 
        parents: [ root_with_id('admin') ], attrs: collab_attrs,
    });

    const collab_foo_attrs =  {
        ou: "Collab Foo",
        description: "Collab Foo",
    };
    await api_post.create(user_prigaux, "collab.foo", collab_foo_attrs)
    await api_post.modify_members_or_rights(user_prigaux, "collab.foo", {
        admin: { add: { [sgroup_id_to_dn("collab.DSIUN")]: {} } },
    }, undefined)
    assert.deepEqual((await ldp.read_flattened_mright(sgroup_id_to_dn("collab.foo"), 'admin')).sort(), [
        sgroup_id_to_dn("collab.DSIUN"), prigaux_dn,
    ]);
    //const remote_sql_query =  remote_query.parse_sql_url("sql: remote=foo : subject=ou=people,dc=nodomain?uid : select username from users").unwrap().unwrap();
    //api_post.modify_remote_sql_query(Default.default(), user_prigaux, "collab.foo", remote_sql_query(), undefined).await?;
    //assert.deepEqual(await api_get.get_sgroup(user_prigaux, "collab.foo").await?,
    //    SgroupAndMoreOut { 
    //        attrs: collab_foo_attrs, more: SgroupOutMore.SynchronizedGroup { remote_sql_query: remote_sql_quer
    //        parents: [ 
    //            root_with_id('admin'), collab_with_id('admin') 
    //        ], right: 'admin' }
    //);

    console.log(`remove last "member". Need to put an empty member back`)
    await api_post.modify_members_or_rights(user_prigaux, "applications.grouper.super-admins", {
        member: { delete: { [prigaux_dn]: {} } },
    }, undefined);
    assert.deepEqual(await ldp.read_one_multi_attr__or_err(sgroup_id_to_dn("applications.grouper.super-admins"), "member"), [""]);
    console.log(`prigaux is no more admin...`)
    await assert.rejects(api_get.get_sgroup(user_prigaux, "collab."))

    console.log(`add group in group "super-admins"`)
    await api_post.modify_members_or_rights(user_trusted, "applications.grouper.super-admins", {
        member: { add: { [sgroup_id_to_dn("collab.DSIUN")]: { enddate: ("20991231000000Z") } } },
    }, undefined)
    assert.deepEqual((await ldp.read_flattened_mright(sgroup_id_to_dn("applications.grouper.super-admins"), 'member')).sort(), 
               [ sgroup_id_to_dn("collab.DSIUN"), prigaux_dn ])
    console.log(`prigaux shoud be admin via stem "" via applications.grouper.super-admins via collab.DSIUN`)
    assert.deepEqual(await api_get.get_sgroup(user_prigaux, "collab."), { 
        attrs: collab_attrs, 
        stem: { children: { "collab.DSIUN": collab_dsiun_attrs, "collab.foo": collab_foo_attrs } }, 
        parents: [ root_with_id('admin') ], right: 'admin' }
    );
    assert.deepEqual(await api_get.mygroups(user_prigaux), {
        "collab.foo": collab_foo_attrs
    })
    assert.deepEqual(await api_get.mygroups(user_aanli), {
        "collab.DSIUN": collab_dsiun_attrs,
    })

    assert.deepEqual(await api_get.search_sgroups(user_prigaux, 'reader', "collaboration", 99), {
        "collab.DSIUN": collab_dsiun_attrs,
    });
    assert.deepEqual(await api_get.search_sgroups(user_prigaux, 'admin', "collaboration", 99), {
        "collab.DSIUN": collab_dsiun_attrs,
    });
    assert.deepEqual(await api_get.search_sgroups(user_aanli, 'updater', "collaboration", 99), {
        "collab.DSIUN": collab_dsiun_attrs,
    });
    assert.deepEqual(await api_get.search_sgroups(user_aanli, 'admin', "collaboration", 99), {});

    assert.deepEqual(await api_get.get_group_flattened_mright(user_prigaux, "collab.DSIUN", 'member', undefined, 1), 
        { count: 1, subjects: prigaux_subject });

    await assert.rejects(api_get.get_group_flattened_mright(user_prigaux, "", 'admin', undefined, undefined));
    await assert.rejects(api_get.get_group_flattened_mright(user_prigaux, "collab.", 'admin', undefined, undefined));
}

export async function set() {
    await clear()
    await add()
}

/*
export async function _test_search(ldap: mut Ldap): Promise<string> {
    const opts = SearchOptions.new().sizelimit(1);
    const (mut rs, _res) = ldap.with_search_options(opts).search("dc=nodomain", Scope.Subtree, "(objectClass=person)", ["displayName"]).await?.success()?;
    const dn = if const (entry) = rs.pop() { SearchEntry.construct(entry).dn } else { "????" };
    return (dn)
}
*/

//set().then(console.log, console.log)
