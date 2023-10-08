import _ from "lodash";
import * as ldapjs from 'ldapjs'
import * as ldapP from 'ldapjs-promise-disconnectwhenidle'
import { DnsOpts, Option, RemoteLdapConfig, RemoteLdapQuery } from "./my_types";
import conf from './conf';
import { throw_ } from './helpers';
import { url_to_dn } from "./dn";

export const to_ldap_url = (rlq: RemoteLdapQuery) => (
    `ldap://${rlq.remote_cfg_name}/${rlq.DN || ''}?${rlq.attribute || ''}??${rlq.filter || ''}`
)

export const parse_ldap_url = (url: string): Option<RemoteLdapQuery> => {
    console.log('parse_ldap_url', url)
    if (!url.startsWith("ldap:")) return;
    if (url_to_dn(url)) return; // this is a plain member

    // @ts-expect-error
    const url_ = ldapjs.url.parse(url)
    if (url_.attributes?.length > 1) throw "only one attribute handled where multiple attributes were found in " + url
    console.log(url, url_)
    return {
        remote_cfg_name: url_.hostname === 'localhost' ? '' : url_.hostname,
        DN: url_.DN,
        attribute: url_.attributes?.[0],
        filter: url_.filter?.toString(),
    }
}

async function raw_query(remote_cfg: RemoteLdapConfig, remote: RemoteLdapQuery): Promise<DnsOpts> {
    const attributes = [remote.attribute || '']
    const filter = remote.filter ?? "(objectClass=*)"
    let entries
    console.log('raw_query', remote_cfg, filter)
    if (remote_cfg) {
        const client = ldapP.new_client(remote_cfg.connect)
        const clientP = ldapP.may_bind(remote_cfg.connect, client)
        const search_dn = remote.DN || remote_cfg.search_branch || throw_(`remote config has no base_dn, and ldap URI has no DN`)
        try {
            entries = await ldapP.searchRaw(search_dn, filter, attributes, { timeLimit: 999 }, clientP)
        } finally {
            client.destroy()
        }
    } else {
        // re-using the main LDAP connection (used for groups/subjects)
        entries = await ldapP.searchRaw(remote.DN || conf.ldap.base_dn, filter, attributes, {})
    }
    return _.fromPairs(entries.map(e => [e.dn, {}]))
}

const to_RemoteLdapConfig = (remote_cfg_name: string): Option<RemoteLdapConfig> => {
    console.trace()
    const remote_cfg = conf.remotes[remote_cfg_name] ?? throw_("internal error: unknown remote " + remote_cfg_name)
    if (remote_cfg.driver === 'ldap') {
        return remote_cfg
    }
    return undefined
}

export function ldap_query(remote: RemoteLdapQuery) {
    console.log('remote_ldap_query', remote)
    const remote_cfg = to_RemoteLdapConfig(remote.remote_cfg_name) ?? throw_("internal error: remote is not LDAP " + remote.remote_cfg_name)
    return raw_query(remote_cfg, remote)
}

