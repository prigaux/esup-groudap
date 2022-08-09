import _ from 'lodash';
import * as ldapjs from 'ldapjs';
import * as ldapP from 'ldapjs-promise-disconnectwhenidle';

import conf from "./conf"
import ldap_filter from './ldap_filter'
import { Dn, hMyMap, MonoAttrs, Mright, MultiAttrs, MyMap, toDn, toDns } from "./my_types";
import { to_flattened_attr } from "./ldap_helpers";
import { throw_ } from './helpers';


ldapP.init(conf.ldap.connect);

export type filter = string
export type Options = ldapjs.SearchOptions

export type RawValue = string | string[]

function singleValue(attr: string, v: RawValue) {
    if (_.isArray(v)) {
      if (v.length > 1) console.warn(`attr ${attr} is multi-valued`);
      return v[0];
    } else {
      return v.toString();
    }
}
  
const multiValue = (v: RawValue) => (
    _.isArray(v) ? v : [v]
)

export async function searchRaw(base: string, filter: filter, attributes: string[], options: Options) {
    if (!filter) {
        console.error("internal error: missing ldap filter");
    }
    try {
        const r = await ldapP.search(base, filter, attributes, options)
        //console.log(r)
        return r
    } catch (e) {
        if (e instanceof ldapjs.NoSuchObjectError) return []
        console.error(e)
        throw new Error(`searchRaw ${base} ${filter} failed: ${e}`)
    }
}

const handle_read_one_search_result = (entries: ldapjs.SearchEntryObject[]) => (
    entries.length === 1 ? entries[0] : undefined
)

export const read = async (dn: Dn, attrs: string[]) => (
    handle_read_one_search_result(await searchRaw(dn, ldap_filter.true_(), attrs, { sizeLimit: 1 }))
)

export const read_one_multi_attr = async (dn: Dn, attr: string) => {
    const entry = await read(dn, [attr])
    if (!entry) return undefined
    const val = entry[attr]
    return val === undefined ? [] : multiValue(val)
}

export const read_one_multi_attr__or_err = async (dn: Dn, attr: string) => (
    await read_one_multi_attr(dn, attr)
        ?? throw_(`internal error (read_one_multi_attr__or_err expects ${dn} to exist)`)
)

export const read_flattened_mright_raw = async (dn: Dn, mright: Mright) => (
    toDns(await read_one_multi_attr__or_err(dn, to_flattened_attr(mright)))
)

export async function read_flattened_mright(dn: Dn, mright: Mright) {
    const l = await read_flattened_mright_raw(dn, mright)
    // turn [""] into []
    return l.length === 1 && l[0] === '' ? [] : l
}

export const is_dn_matching_filter = async (dn: Dn, filter: string) => (
    (await searchRaw(dn, filter, [""], { sizeLimit: 1 })).length > 0
)

export const is_dn_existing = async (dn: Dn) => (
    await is_dn_matching_filter(dn, ldap_filter.true_())
)

export const one_group_matches_filter = async (filter: string) => (
    is_dn_matching_filter(toDn(conf.ldap.groups_dn), filter)
)

export const to_attrs = (entry: ldapjs.SearchEntryObject): MyMap<string, RawValue> => (
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
