import * as ldapjs from 'ldapjs'
import * as ldapP from 'ldapjs-promise-disconnectwhenidle'
import _ from "lodash";

import * as ldp from "./ldap_read_search"
import * as ldpSgroup from './ldap_sgroup_read_search_modify'
import * as api_log from './api_log'
import * as cache from './cache'
import conf from "./conf";
import ldap_filter from "./ldap_filter";
import { Dn, DnsOpts, hMright, hMyMap, LoggedUser, MonoAttrs, Mright, MyMap, MyMod, MyMods, MySet, Option, RemoteQuery, RemoteSqlQuery, Right, toDn, isRqSql } from "./my_types";
import { hashmap_difference, internal_error } from "./helpers";
import { mono_attrs, to_flattened_attr, validate_sgroups_attrs } from "./ldap_helpers";
import { avoid_group_and_groups_including_it__filter, parse_remote_query, user_right_filter, validate_remote } from "./api_get";
import { dn_is_sgroup, sgroup_id_to_dn, urls_to_dns } from "./dn";
import { check_right_on_any_parents, check_right_on_self_or_any_parents } from "./ldap_check_rights";
import { is_stem, validate_sgroup_id } from "./stem_helpers";
import { sql_query, sql_values_to_dns, to_sql_url } from './remote_query';
import { ldap_query, to_ldap_url } from './remote_ldap_query';

/**
 * Create the stem/group
 */
export async function create(logged_user: LoggedUser, id: string, attrs: MonoAttrs) {
    console.log("create(%s)", id);
    validate_sgroup_id(id)
    validate_sgroups_attrs(attrs)
    await check_right_on_any_parents(logged_user, id, 'admin')
    await ldpSgroup.create_sgroup(id, attrs)
    await api_log.log_sgroup_action(logged_user, id, "create", undefined, attrs)
}

async function current_sgroup_attrs(id: string): Promise<MonoAttrs> {
    const attrs = hMyMap.keys(conf.ldap.sgroup_attrs);
    const e = await ldpSgroup.read_sgroup(id, attrs) ?? internal_error()
    return mono_attrs(e)
}

async function remove_non_modified_attrs(id: string, attrs: MonoAttrs): Promise<MonoAttrs> {
    const current = await current_sgroup_attrs(id)
    return _.pickBy(attrs, (val, attr) => val !== current[attr])
}

/**
 * Modify the group/stem attributes (description, ou...)
 */
export async function modify_sgroup_attrs(logged_user: LoggedUser, id: string, attrs: MonoAttrs) {
    console.log("modify_attrs(_)", id);
    validate_sgroup_id(id)
    validate_sgroups_attrs(attrs)
    
    await check_right_on_self_or_any_parents(logged_user, id, 'admin')

    const attrs_ = await remove_non_modified_attrs(id, attrs)

    await ldpSgroup.modify_sgroup_attrs(id, attrs_)
    await api_log.log_sgroup_action(logged_user, id, "modify_attrs", undefined, attrs_)
}

/** 
 * Delete the group/stem
 */
export async function delete_(logged_user: LoggedUser, id: string) {
    validate_sgroup_id(id)
    // are we allowed?
    await check_right_on_self_or_any_parents(logged_user, id, 'admin')
    // is it possible?
    if (await ldp.one_group_matches_filter(ldap_filter.sgroup_children(id))) { 
        throw "can not remove stem with existing children"
    }
    // save last attrs for logging
    const current = await current_sgroup_attrs(id)

    // ok, do it:
    await ldpSgroup.delete_sgroup(id)
    await api_log.log_sgroup_action(logged_user, id, "delete", undefined, current)
}

// which Right is needed for these modifications?
function my_mods_to_right(my_mods: MyMods): Right {
    for (const right of hMyMap.keys(my_mods)) {
        if (right !== 'reader' && right !== 'member') {
            return 'admin'
        }
    }
    return 'updater'
}

function to_submods(add: DnsOpts, delete_: DnsOpts, replace: Option<DnsOpts>): MyMap<MyMod, DnsOpts> {
    return hMyMap.compact({
        add: !_.isEmpty(add) ? add : undefined,
        delete: !_.isEmpty(delete_) ? delete_ : undefined,
        replace: replace,
    })
}
function from_submods(submods: MyMap<MyMod, DnsOpts>): [DnsOpts, DnsOpts, Option<DnsOpts>] {
    return [
        submods.add || {},
        submods.delete || {},
        submods.replace,
    ]
}

async function may_transform_replace_into_AddDelete(id: string, mright: Mright, submods: MyMap<MyMod, DnsOpts>): Promise<MyMap<MyMod, DnsOpts>> {
    const [add, delete_, replace] = from_submods(submods);

    if (replace && _.size(replace) > 4) {
        const current_dns = await ldpSgroup.read_direct_mright(sgroup_id_to_dn(id), mright)
        // transform Replace into Add/Delete
        Object.assign(add, hashmap_difference(replace, current_dns));
        Object.assign(delete_, hashmap_difference(current_dns, replace));
        console.log("  replaced long\n    Replace %s with\n    Add %s\n    Replace %s", replace, add, delete_);
        return to_submods(add, delete_, undefined)
    }
    return to_submods(add, delete_, replace)
}

// Check validity of modifications
// - stems do not allow members
async function check_and_simplify_mods(is_stem: boolean, id: string, my_mods: MyMods): Promise<MyMods> {
    const r: MyMods = {}
    await hMyMap.eachAsync(my_mods, async (submods, mright) => {
        if (mright === 'member' && is_stem) {
            throw "members are not allowed for stems"
        }
        const submods_ = await may_transform_replace_into_AddDelete(id, mright, submods)
        if (!_.isEmpty(submods_)) {
            r[mright] = submods_
        }
    })
    return r
}

export type IdMright = { id: string, mright: Mright }

// Search for groups having this group DN in their member/supannGroupeLecteurDN/supannAdminDN/owner
async function search_groups_mrights_depending_on_this_group(id: string) {
    const r: IdMright[] = []
    const group_dn = sgroup_id_to_dn(id);
    for (const mright of hMright.list()) {
        for (id of await ldpSgroup.search_sgroups_id(ldap_filter.eq(to_flattened_attr(mright), group_dn))) {
            r.push({ id, mright });
        }
    }
    return r
}

enum UpResult { Modified, Unchanged }

async function may_update_flattened_mrights__(id: string, mright: Mright, to_add: MySet<Dn>, to_remove: MySet<Dn>): Promise<UpResult> {
    const attr = to_flattened_attr(mright);
    const mods: ldapjs.Change[] = [];
    if (!_.isEmpty(to_add)) {
        //console.log("will add", attr, to_add)
        mods.push(new ldapjs.Change({ operation: 'add', modification: { [attr]: to_add } }))
    }
    if (!_.isEmpty(to_remove)) {
        //console.log("will remove", attr, to_add)
        mods.push(new ldapjs.Change({ operation: 'delete', modification: { [attr]: to_remove } }))
    }
    if (_.isEmpty(mods)) {
        return UpResult.Unchanged
    }
    try {        
        await ldapP.modify(sgroup_id_to_dn(id), mods)
        return UpResult.Modified
    } catch (e) {
        throw `update_flattened_mright failed on ${id}: ${e}`
    }
}

/** add the group members */
async function get_flattened_dns(direct_dns: MySet<Dn>): Promise<MySet<Dn>> {
    const r = [...direct_dns]
    for (const dn of direct_dns) {
        if (dn_is_sgroup(dn)) {
            r.push(...await ldp.read_flattened_mright(dn, 'member'))
        }
    }
    return r
}

async function remote_sql_query_to_dns(remote: RemoteSqlQuery): Promise<DnsOpts> {
    const sql_values = await sql_query(remote)
    return await sql_values_to_dns(remote.to_subject_source, sql_values)
}

async function remote_query_to_dns(rqs: string) {
    const rq = parse_remote_query(rqs)
    if (rq) {
        if (isRqSql(rq)) {
            return await remote_sql_query_to_dns(rq)
        } else {
            console.log("remote_ldap_query", rq, rq)
            return await ldap_query(rq)
        }
    }
    throw `invalid remote query ${rqs}`
}

async function urls_to_dns_handling_remote(group_dn: Dn, mright: Mright): Promise<DnsOpts> {
    if (mright === 'member') {
        const rq = await ldp.read_one_mono_attr__or_err(group_dn, hMright.attr_synchronized)
        if (rq) {
            return await remote_query_to_dns(rq)
        }
    }
    const urls = await ldp.read_one_multi_attr__or_err(group_dn, hMright.to_attr(mright))
    return urls_to_dns(urls) ?? internal_error()
}

async function may_update_flattened_mrights_(id: string, mright: Mright, group_dn: Dn, direct_dns: MySet<Dn>) {
    const flattened_dns = _.uniq(await get_flattened_dns(direct_dns))
    const new_count = flattened_dns.length
    if (_.isEmpty(flattened_dns) && mright === 'member') {
        flattened_dns.push(toDn(""));
    }
    const current_flattened_dns = await ldp.read_flattened_mright_raw(group_dn, mright)
    const to_add = _.difference(flattened_dns, current_flattened_dns);
    const to_remove = _.difference(current_flattened_dns, flattened_dns);
    const result = await may_update_flattened_mrights__(id, mright, (to_add), (to_remove))
    // ignoring "" values (which are only there to please LDAP server)
    api_log.log_sgroup_flattened_modifications(id, mright, { new_count, added: _.compact(to_add), removed: _.compact(to_remove) })
    return result
}

// read group direct URLs
// diff with group flattened DNs
// if (needed, update group flattened DNs
async function may_update_flattened_mrights(id: string, mright: Mright): Promise<UpResult> {
    console.log("  may_update_flattened_mrights(%s, %s)", id, mright);
    const group_dn = sgroup_id_to_dn(id);

    const direct_dns = await urls_to_dns_handling_remote(group_dn, mright)
    return await may_update_flattened_mrights_(id, mright, group_dn, hMyMap.keys(direct_dns))
}


export async function may_update_flattened_mrights_rec(todo: IdMright[]) {
    for (;;) {
        const one = todo.shift()
        if (!one) return
        const result = await may_update_flattened_mrights(one.id, one.mright)
        if (one.mright === 'member' && result === UpResult.Modified) {
            todo.push(...await search_groups_mrights_depending_on_this_group(one.id))
        } 
    }
}

async function may_check_member_ttl(id: string, my_mods: MyMods) {
    const submods = my_mods.member
    if (submods) {
        const attrs = await current_sgroup_attrs(id)
        const ttl_max = attrs["groupaldOptions;x-member-ttl-max"]
        if (ttl_max) {
            /*
            const max = Utc.now() + Duration.days(ttl_max.parse().map_err(|_| MyErr.Msg("member-ttl-max must be an integer"))?);
            for (action, list) in submods {
                if (*action !== MyMod.Delete {
                    for (dn, opts) in list {
                        const enddate = DateTime.parse_from_rfc3339(
                            opts.enddate.as_ref().ok_or_else(|| MyErr.Msg("enddate mandatory for this sgroup"))?
                        ).map_err(|_| MyErr.Msg(format!("invalid enddate for {:?}", dn)))?;
                        if (enddate > max {
                            throw (format!("enddate > member-ttl-max for {:?}", dn)))
                        }
                    }
                }
            }
            */
        }
    }    
}

async function check_read_right_on_group_subjects__and__non_recursive_member(logged_user: LoggedUser, id: string, my_mods: MyMods) {
    if ('TrustedAdmin' in logged_user) return
    
    let right_filter: string
    await hMyMap.eachAsync(my_mods, async (submods, mright) => {
        for (const dn of hMyMap.values(submods).flatMap(hMyMap.keys)) {
            if (dn_is_sgroup(dn)) {
                right_filter = await user_right_filter(logged_user, 'reader')
                const filter = mright === 'member' ? ldap_filter.and([
                    right_filter,
                    ...avoid_group_and_groups_including_it__filter(id).ands
                ]) : right_filter
                if (!await ldp.is_dn_matching_filter(dn, filter)) {
                    const right_ok = await ldp.is_dn_matching_filter(dn, right_filter)
                    throw right_ok ? "recursive membership not allowed" : "no read right on included group"
                }        
            }
        }
    })
}

/**
 * Modify the group/stem members or rights
 * @param id - group/stem identifier
 * @param my_mods - members or rights to add/remove/replace
 * @param msg - optional message explaining why the user did this action
 */
export async function modify_members_or_rights(logged_user: LoggedUser, id: string, my_mods: MyMods, msg: Option<string>) {
    console.log("modify_members_or_rights(%s, _)", id);
    validate_sgroup_id(id)
    // is logged user allowed to do the modifications?
    await check_right_on_self_or_any_parents(logged_user, id, my_mods_to_right(my_mods))
    // are the modifications valid?
    await may_check_member_ttl(id, my_mods)
    await check_read_right_on_group_subjects__and__non_recursive_member(logged_user, id, my_mods)
    const my_mods_ = await check_and_simplify_mods(is_stem(id), id, my_mods)
    if (_.isEmpty(my_mods_)) {
        // it happens when a "Replace" has been simplified into 0 Add/Delete
        return
    }
   
    // ok, const's do update direct mrights ()
    await ldpSgroup.modify_direct_members_or_rights(id, my_mods_)
    
    await api_log.log_sgroup_action(logged_user, id, "modify_members_or_rights", msg, my_mods_)
    
    // then update flattened groups mrights
    const todo_flattened = hMyMap.mapToArray(my_mods_, (_, mright) => ({id, mright}))
    await may_update_flattened_mrights_rec(todo_flattened)

}

/**
 * Set or modify the SQL query for a group
 * @param id - group/stem identifier
 * @param remote - remote name + (SQL query + optional mapping) or (LDAP filter + ...)
 */
export async function modify_remote_query_(id: string, remote: RemoteQuery | {}) {
    let remote_string: Option<string>
    let forced_periodicity: Option<string>
    if ("remote_cfg_name" in remote) {
        validate_remote(remote)    
        remote_string = isRqSql(remote) ? to_sql_url(remote) : to_ldap_url(remote)
        ;({ forced_periodicity } = remote)
    }
    await ldapP.modify(sgroup_id_to_dn(id), [
        new ldapjs.Change({ operation: 'replace', modification: { 
            [hMright.attr_synchronized]: remote_string
        } }),
        new ldapjs.Change({ operation: 'replace', modification: { 
            [conf.remote_forced_periodicity_attr]: forced_periodicity
        } }),
    ])
}

/**
 * Set or modify the SQL query for a group + synchronize the members
 * @param id - group/stem identifier
 * @param remote - remote name + (SQL query + optional mapping) or (LDAP filter + ...)
 * @param msg - optional message explaining why the user did this action
 */
export async function modify_remote_query(logged_user: LoggedUser, id: string, remote: RemoteQuery | {}, msg: Option<string>) {
    console.log("modify_remote_query(%s, %s, %s)", id, remote, msg);
    validate_sgroup_id(id)

    await modify_remote_query_(id, remote)

    await api_log.log_sgroup_action(logged_user, id, "modify_remote_query", msg, remote)

    const todo: IdMright[] = [{id, mright: 'member'}];
    await may_update_flattened_mrights_rec(todo)

    // needed for new sync group or if "remote_cfg_name" was modified  
    cache.clear_all();
}

export async function sync(logged_user: LoggedUser, id: string, mrights: Mright[]) {
    console.log("sync(%s)", id);
    validate_sgroup_id(id)
    await check_right_on_self_or_any_parents(logged_user, id, 'updater')
    
    const todo: IdMright[] = mrights.map(mright => ({id, mright}))
    await may_update_flattened_mrights_rec(todo)
}

