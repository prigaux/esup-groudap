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
    periodicity_to_sgroup_ids: undefined as Option<PeriodicityToSgroupIds>,
}

export const get_periodicity_to_sgroup_ids = async () => (
    (_all_caches.periodicity_to_sgroup_ids ??= await get_periodicity_to_sgroup_ids_())
)

async function get_periodicity_to_sgroup_ids_() {
    const attr = hMright.attr_synchronized;
    const map: PeriodicityToSgroupIds = {};
    const remote_group_filter = ldap_filter.and([ conf.ldap.group_filter, ldap_filter.presence(attr) ])
    for (const entry of await ldpSgroup.search_sgroups(remote_group_filter, [attr], undefined)) {
        const sgroup_id = dn_to_sgroup_id(entry.dn) ?? internal_error();
        const url = mono_attrs(entry)[attr] ?? internal_error()
        const remote = parse_remote_query(url) ?? internal_error();
        const periodicity: Periodicity = remote.forced_periodicity ?? conf.remotes[remote.remote_cfg_name]?.periodicity ?? internal_error()
        ;(map[periodicity] ??= new Set()).add(sgroup_id);
    }
    return map;
}

export function clear_all() {
    _all_caches.periodicity_to_sgroup_ids = undefined
}

