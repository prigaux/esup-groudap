import conf from "./conf"
import ldap_filter from "./ldap_filter"
import { Dn, MonoAttrs, Mright, Right, hRight } from "./my_types"


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

