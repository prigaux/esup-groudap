import conf from "./conf"
import ldap_filter from "./ldap_filter"
import { before_and_after, generalized_time_to_iso8601, iso8601_to_generalized_time, strip_prefix, strip_suffix } from "./helpers"
import { MyMap, DirectOptions, Dn, MonoAttrs, Mright, Right, toDn, hRight, hMyMap } from "./my_types"
import { root_id } from "./stem_helpers"


export function sgroup_id_to_dn(cn: string): Dn {
    if (cn === root_id()) {
        return toDn(conf.ldap.groups_dn)
    } else {
        return toDn(`cn=${cn},${conf.ldap.groups_dn}`)
    }
}
export const people_id_to_dn = (cn: string) => (
    toDn(`uid=${cn},ou=people,${conf.ldap.base_dn}`)
)
export function dn_to_sgroup_id(dn: string) {
    if (dn == conf.ldap.groups_dn) {
        return ""
    } else {
        const s = strip_suffix(dn, ',' + conf.ldap.groups_dn)
        return s !== undefined ? strip_prefix(s, "cn=") : undefined
    }
}
export const dn_is_sgroup = (dn: Dn) => (
    dn.endsWith(conf.ldap.groups_dn)
)

export const dn_to_subject_source_cfg = (dn: Dn) => (
    conf.ldap.subject_sources.find(sscfg => dn.endsWith(sscfg.dn))
) 

export const to_flattened_attr = (mright: Mright) => {
    const r = conf.ldap.groups_flattened_attr[mright]
    if (r === undefined) throw "missing ${mright} key in ldap.groups_flattened_attr configuration"
    return r
}
export const to_allowed_flattened_attrs = (right: Right) => (
    hRight.to_allowed_rights(right).map(to_flattened_attr)
)

export function validate_sgroups_attrs(attrs: MonoAttrs) {
    for (const attr in attrs) {
        if (!conf.ldap.sgroup_attrs[attr]) {
            throw `sgroup attr ${attr} is not listed in conf [ldap.sgroup_attrs]`
        }
    }
}

export const user_has_direct_right_on_group_filter = (user_dn: Dn, right: Right) => (
    ldap_filter.and2(       
        ldap_filter.or(to_allowed_flattened_attrs(right).map(attr => 
            ldap_filter.eq(attr, user_dn)
        )),
        conf.ldap.group_filter
    )
)

export const sgroup_filter = (id: string) => (
    id === '' ? 
        "(objectClass=organizationalUnit)" :
        ldap_filter.eq("cn", id)
)

export const dn_to_rdn_and_parent_dn = (dn: Dn): [string, Dn] | undefined => (
    before_and_after(dn, ",")?.oMap(([rdn, parent_dn]) => [rdn, toDn(parent_dn)])
)

export function dn_opts_to_url(dn: Dn, opts: DirectOptions) {
    if (opts.enddate) {
        const gtime = iso8601_to_generalized_time(opts.enddate)
        if (gtime) {
            // not standard LDAP filter. inspired from https://www.ietf.org/archive/id/draft-pluta-ldap-srv-side-current-time-match-01.txt
            return `ldap:///${dn}???(serverTime<${gtime})`
        }
    }
    return dn_to_url(dn)
}

export const dn_to_url = (dn: Dn) => (
    `ldap:///${dn}`
)

export function url_to_dn(url: string): [Dn, DirectOptions] | undefined {
    const dn = strip_prefix(url, "ldap:///")
    if (dn === undefined) return undefined
    const m = dn.match(/(.*)[?][?][?]\(serverTime<(.*)\)$/)
    if (m) {
        return [toDn(m[1]), { enddate: generalized_time_to_iso8601(m[2]) }]
    } else if (dn.includes('?')) {
        return undefined
    } else { 
        return [toDn(dn), {}]
    }
}

export const urls_to_dns = (urls: string[]): MyMap<Dn, DirectOptions> => (
    hMyMap.fromOptionPairs(urls.map(url_to_dn))
)
