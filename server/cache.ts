import * as ldpSgroup from './ldap_sgroup_read_search_modify'
import ldap_filter from "./ldap_filter";
import { internal_error } from "./helpers";
import { dn_to_sgroup_id } from "./dn";
import { mono_attrs } from "./ldap_helpers";
import { hMright, MyMap, Option } from "./my_types";
import { parse_remote_query } from './api_get';
import conf from './conf';
import { Periodicity } from './periodicity';

type PeriodicityToSgroupIds = MyMap<Periodicity, Set<string>>;

const _all_caches = {
    periodicity_to_group_ids: undefined as Option<PeriodicityToSgroupIds>,
    groups_used_in_sync_members: undefined as Option<MyMap<string, string[]>>,
}

export const get_periodicity_to_group_ids = async () => {
    if (!_all_caches.periodicity_to_group_ids) {
        Object.assign(_all_caches, await get_synchronized_groups_info())
    }
    return _all_caches.periodicity_to_group_ids ?? internal_error()
}

export const get_groups_used_in_sync_members = async () => {
    if (!_all_caches.groups_used_in_sync_members) {
        Object.assign(_all_caches, await get_synchronized_groups_info())
    }
    return _all_caches.groups_used_in_sync_members ?? internal_error()
}

async function get_synchronized_groups_info() {
    const attr = hMright.attr_synchronized;
    const periodicity_to_group_ids: PeriodicityToSgroupIds = {};
    const groups_used_in_sync_members: MyMap<string, string[]> = {}
    const remote_group_filter = ldap_filter.and([ conf.ldap.group_filter, ldap_filter.presence(attr) ])
    for (const entry of await ldpSgroup.search_sgroups(remote_group_filter, [attr], undefined)) {
        const group_id = dn_to_sgroup_id(entry.dn) ?? internal_error();
        const url = mono_attrs(entry)[attr] ?? internal_error()
        let remote;
        try {
            remote = parse_remote_query(url)
        } catch (err) {
            console.error(err) 
            throw "invalid remote group " + group_id
        }

        const periodicity: Periodicity = remote.forced_periodicity ?? conf.remotes[remote.remote_cfg_name]?.periodicity ?? internal_error()
        ;(periodicity_to_group_ids[periodicity] ??= new Set()).add(group_id);

        if ("filter" in remote && remote.filter) {
            for (const m of remote.filter.matchAll(/[(]memberOf=([^)]*)[)]/g)) {
                const subgroup = dn_to_sgroup_id(m[1])
                if (subgroup) {
                    (groups_used_in_sync_members[subgroup] ??= []).push(group_id)
                }
            }
        }
    }
    //console.log("groups_used_in_sync_members", groups_used_in_sync_members)
    return { periodicity_to_group_ids, groups_used_in_sync_members };
}

export function clear_all() {
    _all_caches.periodicity_to_group_ids = undefined
    _all_caches.groups_used_in_sync_members = undefined
}

