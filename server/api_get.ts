import _ from "lodash"
import conf from "./conf"
import ldap_filter from "./ldap_filter"
import * as ldp from "./ldap_read_search"
import * as my_ldap from './my_ldap'
import * as api_log from './api_log'
import * as remote_query from './remote_query'
import { dn_to_sgroup_id, people_id_to_dn, sgroup_id_to_dn } from "./dn"
import { mono_attrs, mono_attrs_, multi_attrs, sgroup_filter, to_allowed_flattened_attrs, to_flattened_attr, user_has_direct_right_on_group_filter } from "./ldap_helpers"
import { Dn, hLdapConfig, hMright, hMyMap, hRight, LoggedUser, LoggedUserDn, MonoAttrs, Mright, MultiAttrs, MyMap, MySet, Option, RemoteSqlQuery, Right, SgroupAndMoreOut, SgroupOutAndRight, SgroupOutMore, SgroupsWithAttrs, Subjects, SubjectsAndCount, toDn } from "./my_types"
import { is_grandchild, is_stem, parent_stems, validate_sgroup_id } from "./stem_helpers"
import { SearchEntryObject } from "ldapjs"
import { check_right_on_self_or_any_parents, user_has_right_on_sgroup_filter } from "./my_ldap_check_rights"
import { get_subjects_from_urls, get_subjects, hSubjectSourceConfig, search_subjects } from "./my_ldap_subjects"
import { direct_members_to_remote_sql_query, TestRemoteQuerySql } from "./remote_query"

const user_dn = (logged_user: LoggedUser): LoggedUserDn => (
    'TrustedAdmin' in logged_user ?
        { TrustedAdmin: true } :
        { User: people_id_to_dn(logged_user.User) }
)

function user_highest_right(sgroup_attrs: MultiAttrs, user_dn: Dn): Option<Right> {
    for (const right of hRight.to_allowed_rights('reader')) {
        const dns = sgroup_attrs[to_flattened_attr(right)]
        if (dns?.includes(user_dn)) {
            return right
        }
    }
    return undefined
}

/*
export function to_rel_ou(parent_attrs: MonoAttrs, attrs: MonoAttrs): MonoAttrs {
    // if inside stem "Applications", transform "Applications:Filex" into "Filex" 
    // TODO keep it only if "grouper" migration flag activated?
    if const ((parent_ou), (child_ou)) = (parent_attrs.get("ou"), attrs.get_mut("ou")) {
        if const (child_inner_ou) = child_ou.strip_prefix(parent_ou) {
            *child_ou = child_inner_ou.trim_start_matches(":");
        }
    }
    attrs
}
*/

export async function get_children(id: string): Promise<SgroupsWithAttrs> {
    console.log("  get_children(%s)", id);
    const wanted_attrs = hMyMap.keys(conf.ldap.sgroup_attrs)
    const filter_ = ldap_filter.sgroup_children(id);
    const filter = ldap_filter.and2_if_some(filter_, conf.ldap.sgroup_filter);
    const children = hMyMap.fromOptionPairs((await my_ldap.search_sgroups(filter, wanted_attrs, undefined)).map(e => {
        const child_id = dn_to_sgroup_id(e.dn)
        // ignore grandchildren
        if (!child_id || is_grandchild(id, child_id)) { return undefined }
        const attrs = simplify_hierachical_ou(mono_attrs(e));
        return [child_id, attrs]
    }))
    return children
}

// compute direct right, without taking into account right inheritance (inheritance is handled in "get_parents()")
async function get_parents_raw(filter: string, user_dn: LoggedUserDn, sizeLimit: Option<number>): Promise<MyMap<string, SgroupOutAndRight>> {
    const display_attrs = hMyMap.keys(conf.ldap.sgroup_attrs)
    const wanted_attrs = [ ...display_attrs, ...to_allowed_flattened_attrs('reader') ]
    const groups = hMyMap.fromOptionPairs((await my_ldap.search_sgroups(filter, wanted_attrs, sizeLimit)).map(e => {
        const right = 'TrustedAdmin' in user_dn ? 'admin' : user_highest_right(multi_attrs(e), user_dn.User)
        return dn_to_sgroup_id(e.dn)?.oMap(id => {
            const attrs = to_sgroup_attrs(id, e);
            return [ id, { attrs, right, sgroup_id: id } ]
        })
    }))
    return (groups)
}
async function get_parents(id: string, user_dn: LoggedUserDn): Promise<SgroupOutAndRight[]> {
    const parents_id = parent_stems(id);
    const filter = ldap_filter.or(parents_id.map(sgroup_filter))
    const parents = await get_parents_raw(filter, user_dn, undefined)

    // convert to Array using the order of parents_id + compute right (inheriting from parent)
    parents_id.reverse();

    const ordered_parents = _.compact(parents_id.map(id => parents[id]))

    // add inherited rights
    let best: Option<Right> = undefined;
    for (const parent of ordered_parents) {
        parent.right = best = hRight.max(best, parent.right)
    }
    return ordered_parents
}

async function get_right_and_parents(logged_user: LoggedUser, id: string, self_attrs: MultiAttrs): Promise<[Right, SgroupOutAndRight[]]> {
    const user_dn_ = user_dn(logged_user)

    const self_right = 'TrustedAdmin' in user_dn_ ? 'admin' : user_highest_right(self_attrs, user_dn_.User)
    //console.log('  self_right', self_right)

    const parents = await get_parents(id, user_dn_)

    console.log('  best_right_on_self_or_any_parents("%s") with user %s', id, logged_user);
    let best = self_right;
    for (const parent of parents) {
        best = hRight.max(parent.right, best)
    }
    console.log('  best_right_on_self_or_any_parents("%s") with user %s => %s', id, logged_user, best);
    if (!best) { throw `no right to read sgroup "${id}"` }
    return [best, parents]
}

export async function get_sgroup(logged_user: LoggedUser, id: string): Promise<SgroupAndMoreOut> {
    console.log(`get_sgroup("${id}")`);
    validate_sgroup_id(id)

    // we query all the attrs we need: attrs for direct_members + attrs to compute rights + attrs to return
    const wanted_attrs = [ 
        hMright.to_attr('member'),
        ...to_allowed_flattened_attrs('reader'),
        ...hMyMap.keys(conf.ldap.sgroup_attrs),
    ]
    const entry = await my_ldap.read_sgroup(id, wanted_attrs)
    if (!entry) { throw `sgroup ${id} does not exist` }

    //console.log("      read sgroup {} => %s", id, entry);
    const is_stem_ = is_stem(id);

    // use the 3 attrs kinds:
    const mattrs = multi_attrs(entry);
    // #1 direct members
    const direct_members_ = mattrs[hMright.to_attr('member')] || []
    const remote_query = mattrs[hMright.to_attr_synchronized('member')] || []
    // #2 compute rights (also computing parents because both require user_dn)
    const [right, parents] = await get_right_and_parents(logged_user, id, mattrs)
    // #3 pack sgroup attrs:
    const attrs = to_sgroup_attrs(id, entry);

    let more : SgroupOutMore
    if (is_stem_) { 
        const children = await get_children(id)
        more = { stem: { children } }
    } else {
        const remote_sql_query = direct_members_to_remote_sql_query(remote_query)
        if (remote_sql_query) {
            more = { synchronizedGroup: { remote_sql_query } }
        } else { 
            const direct_members = await get_subjects_from_urls(direct_members_)
            more = { group: { direct_members } }
        }
    }
    return { attrs, right, ...more, parents }
}

export async function get_sgroup_direct_rights(_logged_user: LoggedUser, id: string) {
    console.log("get_sgroup_direct_rights(%s)", id);
    validate_sgroup_id(id)

    const group = await my_ldap.read_sgroup(id, hRight.to_allowed_attrs('reader'))
    if (!group) { throw `sgroup ${id} does not exist` }

    const attrs = multi_attrs(group);
    const r: MyMap<Right, Subjects> = {}
    for (const right of hRight.to_allowed_rights('reader')) {
        const urls = attrs[hRight.to_attr(right)]
        if (urls) {
            const subjects = await get_subjects_from_urls(urls)
            r[right] = subjects
        }
    }
    return r
}

// sizeLimit is applied for each subject source, so the max number of results is sizeLimit * nb_subject_sources
export async function get_group_flattened_mright(_logged_user: LoggedUser, id: string, mright: Mright, search_token: Option<string>, sizeLimit: Option<number>): Promise<SubjectsAndCount> {
    console.log("get_group_flattened_mright(%s)", id);
    validate_sgroup_id(id)
    
    if (is_stem(id)) {
        throw "get_group_flattened_mright works only on groups, not stems"
    }

    const flattened_dns = await ldp.read_flattened_mright(sgroup_id_to_dn(id), mright)

    const count = flattened_dns.length
    const subjects = await get_subjects(flattened_dns, {}, search_token, sizeLimit)
    return { count, subjects }
}

export async function api_search_subjects(_logged_user: LoggedUser, search_token: string, sizeLimit: number, source_dn: Option<Dn>) {
    console.log("search_subjects({}, %s)", search_token, source_dn);
    const r: MyMap<Dn, Subjects> = {}
    for (const sscfg of conf.ldap.subject_sources) {
        if (!source_dn || source_dn === sscfg.dn) {
            const filter = hSubjectSourceConfig.search_filter_(sscfg, search_token);
            r[toDn(sscfg.dn)] = await search_subjects(toDn(sscfg.dn), sscfg.display_attrs, filter, {}, sizeLimit)
        }
    }
    return r
}

async function search_sgroups_with_attrs(filter: string, sizeLimit: Option<number>): Promise<SgroupsWithAttrs> {
    const wanted_attrs = hMyMap.keys(conf.ldap.sgroup_attrs);
    return hMyMap.fromOptionPairs((await my_ldap.search_sgroups(filter, wanted_attrs, sizeLimit)).map(e => (
        dn_to_sgroup_id(e.dn)?.oMap(id => [id, mono_attrs(e)]))
    ))
}

function simplify_hierachical_ou(attrs: MonoAttrs): MonoAttrs {
    const ou = attrs.ou?.replace(/.*:/, '')
    if (ou) attrs.ou = ou
    return attrs
}

function to_sgroup_attrs(id: string, attrs: SearchEntryObject): MonoAttrs {
    let attrs_ = mono_attrs_(attrs, hMyMap.keys(conf.ldap.sgroup_attrs))
    if (id === "") {
        // TODO, move this in conf?
        attrs_["ou"] = "Racine"
    } else {
        attrs_ = simplify_hierachical_ou(attrs_)
    }
    return attrs_
}

// returns groups user has DIRECT right update|admin
// (inherited rights via stems are not taken into account)
export async function mygroups(logged_user: LoggedUser) {
    console.log("mygroups()");
    if ('TrustedAdmin' in logged_user) {
        throw "mygroups need a real user"
    } else {        
        const filter = user_has_direct_right_on_group_filter(people_id_to_dn(logged_user.User), 'updater')
        return await search_sgroups_with_attrs(filter, undefined)
    }
}

// example of filter used: (| (owner=uid=prigaux,...) (supannGroupeAdminDn=uid=prigaux,...) )
async function get_all_stems_id_with_user_right(user_dn: Dn, right: Right): Promise<MySet<string>> {
    const stems_with_right_filter = ldap_filter.and2(
        conf.ldap.stem.filter,
        user_has_right_on_sgroup_filter(user_dn, right),
    );
    const stems_id = await my_ldap.search_sgroups_id(stems_with_right_filter)
    return stems_id
}

export async function search_sgroups(logged_user: LoggedUser, right: Right, search_token: string, sizeLimit: number): Promise<SgroupsWithAttrs> {
    console.log("search_sgroups(%s, %s)", search_token, right);

    const term_filter = hSubjectSourceConfig.search_filter_(hLdapConfig.sgroup_sscfg(conf.ldap), search_token)

    let group_filter: string
    if ('TrustedAdmin' in logged_user) {
        group_filter = term_filter
    } else {
        const user_dn = people_id_to_dn(logged_user.User)
        // from direct rights
        // example: (|(supannGroupeLecteurDN=uid=prigaux,...)(supannGroupeLecteurDN=uid=owner,...))
        const user_direct_allowed_groups_filter = 
            user_has_direct_right_on_group_filter(user_dn, right);

        // from direct rights
        // example: (|(cn=a.*)(cn=b.bb.*)) if user has right on stems "a."" and "b.bb." 
        // TODO: cache !?
        const stems_id_with_right = await get_all_stems_id_with_user_right(user_dn, right)
        const children_of_allowed_stems_filter =
            // TODO: simplify: no need to keep "a." and "a.b."
            ldap_filter.or(
                stems_id_with_right.map(stem_id => ldap_filter.sgroup_self_and_children(stem_id))
            )

        const right_filter = ldap_filter.or([
            user_direct_allowed_groups_filter, 
            children_of_allowed_stems_filter,
        ]);
        group_filter = ldap_filter.and2_if_some(
            ldap_filter.and2(right_filter, term_filter),
            conf.ldap.sgroup_filter)        
    }
    return await search_sgroups_with_attrs(group_filter, (sizeLimit))
}

export async function get_sgroup_logs(logged_user: LoggedUser, id: string, bytes: number) {
    console.log("get_sgroup_logs({}, %s)", id, bytes);   
    validate_sgroup_id(id)

    await check_right_on_self_or_any_parents(logged_user, id, 'admin');

    await api_log.get_sgroup_logs(id, bytes)
}

export function validate_remote(remote: RemoteSqlQuery) {
    if (!conf.remotes[remote.remote_cfg_name]) {
        throw `unknown remove_cfg_name ${remote.remote_cfg_name}`
    }
    const to_ss = remote.to_subject_source
    if (to_ss) {
        if (!conf.ldap.subject_sources.some(ss => ss.dn === to_ss.ssdn)) {
            throw `unknown to_subject_source.ssdn ${to_ss.ssdn}`
        }
    }
}

export async function test_remote_query_sql(logged_user: LoggedUser, id: string, remote_sql_query: RemoteSqlQuery): Promise<TestRemoteQuerySql> {
    console.log("test_remote_query_sql({}, %s)", id, remote_sql_query);   
    validate_sgroup_id(id)
    validate_remote(remote_sql_query)

    await check_right_on_self_or_any_parents(logged_user, id, 'admin')

    return await remote_query.test_remote_query_sql(remote_sql_query)
}

export const export_for_tests = { user_highest_right }
