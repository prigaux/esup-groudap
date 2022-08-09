import _ from 'lodash'
import * as ldapjs from 'ldapjs'
import * as ldapP from 'ldapjs-promise-disconnectwhenidle'
import conf from "./conf"
import ldap_filter from './ldap_filter'
import { MySet, Dn, DnsOpts, MonoAttrs, Mright, MyMods, Option, Right, SubjectAttrs, Subjects, toDn, hMright, hMyMap, hRight, MyMap } from './my_types';
import { dn_opts_to_url, dn_to_sgroup_id, dn_to_url, people_id_to_dn, sgroup_id_to_dn, urls_to_dns } from "./ldap_helpers"
import { is_dn_matching_filter, mono_attrs, RawValue, read, read_one_multi_attr__or_err, searchRaw } from "./ldap_wrapper"
import { is_stem } from "./stem_helpers"
import { get_delete } from './helpers';


export const is_sgroup_matching_filter = async (id: string, filter: string) => (
    await is_dn_matching_filter(sgroup_id_to_dn(id), filter)
)
export const is_sgroup_existing = async (id: string) => (
    await is_sgroup_matching_filter(id, ldap_filter.true_())
);

export async function ldap_add_group(cn: string, attrs: MyMap<string, RawValue>) {
    const is_stem_ = is_stem(cn);
    const objectClass = is_stem_ ? conf.ldap.stem_object_classes : conf.ldap.group_object_classes
    const member_attr = is_stem_ ? {} : { member: "" } // "member" is requested...
    const all_attrs = { objectClass, cn, ...member_attr, ...attrs }
    await ldapP.add(sgroup_id_to_dn(cn), all_attrs)
}

export async function delete_sgroup(id: string) {
    await ldapP.del(sgroup_id_to_dn(id))
}

export async function read_direct_mright(group_dn: Dn, mright: Mright) {
    const direct_urls = await read_one_multi_attr__or_err(group_dn, hMright.to_attr(mright))
    return urls_to_dns(direct_urls)
}

export async function read_sgroup(id: string, attrs: string[]) {
    const dn = sgroup_id_to_dn(id);
    return await read(dn, attrs)
}

export const search_sgroups = async (filter: string, attrs: string[], sizeLimit: Option<number>) => (
    await searchRaw(conf.ldap.groups_dn, filter, attrs, { sizeLimit })
)

export const search_sgroups_dn = async (filter: string) => (
    (await search_sgroups(filter, [""], undefined)).map(e => toDn(e.dn))
)

export const search_sgroups_id = async (filter: string) => (
    (await search_sgroups_dn(filter)).map(dn => {
        const id = dn_to_sgroup_id(dn)
        if (id === undefined ) throw `weird DN ${dn}`
        return id
    })
)

async function user_groups_dn(user_dn: Dn) {
    const filter = ldap_filter.member(user_dn);
    return await search_sgroups_dn(filter)
}

// returns DNs
export async function user_groups_and_user_dn(user: string) {
    const user_dn = people_id_to_dn(user);
    const user_groups = new Set(await user_groups_dn(user_dn))
    user_groups.add(user_dn);
    return [...user_groups]
}

export async function search_subjects(base_dn: Dn, attrs: string[], filter: string, dn2opts: DnsOpts, sizeLimit: Option<number>): Promise<Subjects> {
    const entries = await searchRaw(base_dn, filter, attrs, { sizeLimit });
    return _.fromPairs(entries.map(entry => { 
        const sgroup_id = dn_to_sgroup_id(entry.dn);
        const options = get_delete(dn2opts, entry.dn) ?? {};
        const subjectAttrs: SubjectAttrs = { attrs: mono_attrs(entry), sgroup_id, options };
        return [ toDn(entry.dn), subjectAttrs ]
    }))
}   

export async function create_sgroup(id: string, attrs: MonoAttrs) {
    await ldap_add_group(id, attrs)
}

export async function modify_sgroup_attrs(id: string, attrs: MonoAttrs) {
    const modification = _.mapValues(attrs, (val) => val === "" ? [] : val)
    await ldapP.modify(sgroup_id_to_dn(id), new ldapjs.Change({ operation: 'replace', modification }))
}

function to_ldap_mods(mods: MyMods) {
    const r: ldapjs.Change[] = [];
    hMyMap.each(mods, (submods, right) => {
        const attr = hRight.to_attr(right);
        hMyMap.each(submods, (list, operation) => {
            const modification = { [attr]: hMyMap.mapToArray(list, (opts, dn) => dn_opts_to_url(dn, opts)) }
            r.push(new ldapjs.Change({ operation, modification }));
        })
    })
    return r
}

export async function modify_direct_members_or_rights(id: string, my_mods: MyMods) {
    if (is_stem(id) && my_mods['member']) { 
        throw "Member not allowed for stems"
    } else {
        const mods = to_ldap_mods(my_mods);
        await ldapP.modify(sgroup_id_to_dn(id), mods)
    }
}

export async function user_urls_(user: string) {
    const r = (await user_groups_and_user_dn(user)).map(dn_to_url)
    console.log("    user_urls(%s) => %j", user, r);
    return r
}

export const user_has_right_on_sgroup_filter = (user_urls: MySet<string>, right: Right) => (
    ldap_filter.or(
        hRight.to_allowed_attrs(right).flatMap(attr => (
            user_urls.map(url => ldap_filter.eq(attr, url))
        ))
    )
)
