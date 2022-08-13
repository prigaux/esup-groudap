import * as ldpSgroup from './ldap_sgroup_read_search_modify'
import { internal_error } from "./helpers";
import ldap_filter from "./ldap_filter";
import { dn_to_sgroup_id } from "./dn";
import { mono_attrs } from "./ldap_helpers";
import { hMright, MyMap, Option, RemoteSqlQuery } from "./my_types";
import { parse_sql_url } from "./remote_query";

type RemoteToSgroupIds = MyMap<string, Set<string>>;

const _all_caches = {
    remote_to_sgroup_ids: undefined as Option<RemoteToSgroupIds>,
}

export const get_remote_to_sgroup_ids = async () => (
    (_all_caches.remote_to_sgroup_ids ??= await get_remote_to_sgroup_ids_())
)

async function get_remote_to_sgroup_ids_() {
    const attr = hMright.to_attr_synchronized('member');
    const map: RemoteToSgroupIds = {};
    for (const entry of await ldpSgroup.search_sgroups(ldap_filter.presence(attr), [attr], undefined)) {
        const sgroup_id = dn_to_sgroup_id(entry.dn) ?? internal_error();
        const url = mono_attrs(entry)[attr] ?? internal_error()
        const remote: RemoteSqlQuery = parse_sql_url(url) ?? internal_error();
        (map[remote.remote_cfg_name] ??= new Set()).add(sgroup_id);
    }
    return map;
}

export function clear_all() {
    _all_caches.remote_to_sgroup_ids = undefined
}

