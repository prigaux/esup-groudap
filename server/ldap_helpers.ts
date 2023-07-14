import * as ldapjs from 'ldapjs';
import _ from "lodash"

import conf from "./conf"
import ldap_filter from "./ldap_filter"
import { Dn, MonoAttrs, Mright, Right, hRight, MyMap, hMyMap, MultiAttrs, Option } from "./my_types"

export type LdapRawValue = string | string[]

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
    to_allowed_flattened_attrs(right).map(attr => 
        ldap_filter.eq(attr, user_dn)
    )
)

export const sgroup_filter = (id: string) => (
    id === '' ? 
        "(objectClass=organizationalUnit)" :
        ldap_filter.eq("cn", id)
)

export function singleValue(attr: string, v: Option<LdapRawValue>) {
    if (_.isArray(v)) {
      if (v.length > 1) console.warn(`attr ${attr} is multi-valued`);
      return v[0];
    } else {
      return v?.toString();
    }
}

export const multiValue = (v: LdapRawValue) => (
    _.isArray(v) ? v : [v]
)
  
export const to_attrs = (entry: ldapjs.SearchEntryObject): MyMap<string, LdapRawValue> => (
    _.omit(entry, 'dn', 'controls')
)
export const mono_attrs = (entry: ldapjs.SearchEntryObject): MonoAttrs => (
    hMyMap.mapValues(to_attrs(entry), (v, attr) => singleValue(attr, v))
)
export const mono_attrs_ = (entry: ldapjs.SearchEntryObject, wanted_attrs: string[]): MonoAttrs => (
    hMyMap.fromOptionPairs(wanted_attrs.map(attr => (
        entry[attr]?.oMap(val => [attr, singleValue(attr, val)])
    )))
)
export const multi_attrs = (entry: ldapjs.SearchEntryObject): MultiAttrs => (
    hMyMap.mapValues(to_attrs(entry), multiValue)
)
