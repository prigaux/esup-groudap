import * as ldpSgroup from './ldap_sgroup_read_search_modify'
import ldap_filter from "./ldap_filter";
import { internal_error } from "./helpers";
import { dn_to_sgroup_id } from "./dn";
import { mono_attrs } from "./ldap_helpers";
import { hMright, MyMap, Option } from "./my_types";
import { parse_remote_query } from './api_get';

type RemoteToSgroupIds = MyMap<string, Set<string>>;

const _all_caches = {
    remote_to_sgroup_ids: undefined as Option<RemoteToSgroupIds>,
}

export const get_remote_to_sgroup_ids = async () => (
    (_all_caches.remote_to_sgroup_ids ??= await get_remote_to_sgroup_ids_())
)

async function get_remote_to_sgroup_ids_() {
    const attr = hMright.attr_synchronized;
    const map: RemoteToSgroupIds = {};
    for (const entry of await ldpSgroup.search_sgroups(ldap_filter.presence(attr), [attr], undefined)) {
        const sgroup_id = dn_to_sgroup_id(entry.dn) ?? internal_error();
        const url = mono_attrs(entry)[attr] ?? internal_error()
        const remote: RemoteQuery = parse_remote_query(url) ?? internal_error();
        (map[remote.remote_cfg_name] ??= new Set()).add(sgroup_id);
    }
    return map;
}

export function clear_all() {
    _all_caches.remote_to_sgroup_ids = undefined
}

