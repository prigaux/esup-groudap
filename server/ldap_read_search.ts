import * as ldapjs from 'ldapjs';
import * as ldapP from 'ldapjs-promise-disconnectwhenidle';

import conf from "./conf"
import ldap_filter from './ldap_filter'
import { Dn, Mright, toDn, toDns } from "./my_types";
import { multiValue, singleValue, to_flattened_attr } from "./ldap_helpers";
import { throw_ } from './helpers';


ldapP.init(conf.ldap.connect);

export type filter = string
export type Options = ldapjs.SearchOptions

export async function searchRaw(base: string, filter: filter, attributes: string[], options: Options) {
    if (!filter) {
        console.error("internal error: missing ldap filter");
    }
    try {
        const r = await ldapP.search(base, filter, attributes, options)
        //console.log('\x1b[33m%s %s %s => %s\x1b[0m', base, filter, attributes, r)
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

export const read_or_err = async (dn: Dn, attrs: string[]) => (
    await read(dn, attrs) ?? throw_(`internal error (read_or_err expects ${dn} to exist)`)
)

export const read_one_multi_attr = async (dn: Dn, attr: string) => {
    const entry = await read(dn, [attr])
    if (!entry) return undefined
    const val = entry[attr]
    return val === undefined ? [] : multiValue(val)
}

export const read_one_mono_attr__or_err = async (dn: Dn, attr: string) => {
    const entry = await read_or_err(dn, [attr])
    return entry ? singleValue(attr, entry[attr]) : undefined
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

