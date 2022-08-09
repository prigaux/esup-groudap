import * as assert from 'assert';
import {it} from '@jest/globals';
import conf from "../conf"
import { LdapConfig, toDn } from '../my_types';
import { dn_opts_to_url, dn_to_sgroup_id, sgroup_id_to_dn, url_to_dn } from '../ldap_helpers';


const ldap_config = (): LdapConfig => ({
        connect: {
            uri: [],
            dn: "",
            password: "",
        },
        base_dn: "dc=nodomain",
        groups_dn: "ou=groups,dc=nodomain",
        stem_object_classes: [],
        group_object_classes: [],
        stem: { filter: "(objectClass=organizationalRole)", separator: ".", root_id: "" },
        subject_sources: [],
        sgroup_attrs: {},
        groups_flattened_attr: {
            member: "member",
            reader: "supannGroupeLecteurDN",
            updater: "supannGroupeAdminDN",
            admin: "owner",
        },
    }
)

it('sgroup_id_to_dn', () => {
    conf.ldap = ldap_config();
    assert.equal(sgroup_id_to_dn("a"), "cn=a,ou=groups,dc=nodomain");
    assert.equal(sgroup_id_to_dn(""), "ou=groups,dc=nodomain");
})

it('dn_to_sgroup_id', () => {
    conf.ldap = ldap_config();
    assert.equal(dn_to_sgroup_id("cn=a,ou=groups,dc=nodomain"), "a");
    assert.equal(dn_to_sgroup_id("ou=groups,dc=nodomain"), "");
})

it('dn_opts_to_url', () => {
    assert.deepEqual(dn_opts_to_url(toDn('foo'), {}), 'ldap:///foo')
    assert.deepEqual(dn_opts_to_url(toDn('foo'), { enddate: '2099-12-31T23:59:59' }), 'ldap:///foo???(serverTime<20991231235959Z)')
})

it('url_to_dn', () => {
    assert.deepEqual(url_to_dn('ldap:///foo'), ['foo', {}])
    assert.deepEqual(url_to_dn('ldap:///foo???(serverTime<20991231235959Z)'), ['foo', { enddate: "2099-12-31T23:59:59" }])
    assert.deepEqual(url_to_dn('foo'), undefined)
})