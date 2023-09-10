import { at, pick, pickBy } from "lodash";
import { forEach, objectSortBy } from "./helpers";
import { Dn, LdapConfigOut, MonoAttrs, Mright, MyMods, Option, PRecord, RemoteConfig, RemoteQuery, Right, SgroupAndMoreOut, SgroupLog, SgroupsWithAttrs, Subjects, SubjectsAndCount, Subjects_with_more, ToSubjectSource } from "./my_types";
import { Ref } from "vue";

const api_url = document.location.href.replace(/[^/]*$/, 'api');

export async function login() {
    const cfg = await (await fetch("/api/config/public")).json()
    if (cfg && cfg.cas_prefix_url) {
        document.location.href =
            cfg.cas_prefix_url + "/login?service=" +
            encodeURIComponent(api_url + "/login?target=" + encodeURIComponent(document.location.pathname + document.location.search)) +
            document.location.hash
    }
}

async function handle_response(response: Response) {
    if (response.status === 200) {
        const json = await response.json()
        console.log(json)
        return json
    }
    if (response.status === 401) {
        await login();
        return new Promise(_ => {}) // return dead promise
    }
    let err = await response.text()
    try {
        const json_err = JSON.parse(err)
        if (json_err.error && json_err.msg) {
            err = json_err.msg
        }
    } catch {}
    err ||= response.toString();
    console.log(err);
    alert(err);
    throw new Error(err)
}

function compute_url(api_function: string, search_params: Record<string, string>) {
    const url = new URL(api_url + '/' + api_function);
    for (const key in search_params) {
        url.searchParams.set(key, search_params[key]);
    }
    return url.toString();
}

let memoized: Record<string, any> = {}

type opts_abort = { abort?: Ref<Option<() => void>> }
type opts_get = { memoize?: true } & opts_abort
type opts_post = opts_abort

async function api_(api_function: string, search_params: Record<string, string>, request_params: RequestInit, opts: opts_post & opts_get) {
    const url = compute_url(api_function, search_params);
    if (opts.memoize && memoized[url]) {
        return memoized[url]
    }
    if (opts.abort) {
        // abort previous request if it is running
        opts.abort.value?.()

        const controller = new AbortController();
        opts.abort.value = () => controller.abort()
        request_params.signal = controller.signal;
    }
    try {
        const json = await handle_response(await fetch(url, request_params));
        if (opts.memoize) {
            memoized[url] = json
        }
        return json
    } finally {
        // mark the request as finished
        if (opts.abort) {
            console.log('mark the request as finished')
            opts.abort.value = undefined
        }
    }
}

const remove_empty_params = (params: Record<string, string>) => (
    pickBy(params, (v) => v)
)

const api_get = (api_function: string, search_params: Record<string, string>, opts: opts_get) => (
    api_(api_function, search_params, {}, opts)
)

const api_post = (api_function: string, search_params: Record<string, string>, json_body: Option<Record<string, any>>, opts?: opts_post) => {
    const body = json_body && JSON.stringify(json_body)
    return api_(api_function, search_params, { body, method: 'POST' }, opts ?? {})
}

export const modify_members_or_rights = (id: string, mods: MyMods) => (
    api_post("modify_members_or_rights", { id }, mods)
)
export const modify_remote_query = (id: string, remote: Option<RemoteQuery>, opts: opts_post) => (
    api_post("modify_remote_query", { id }, remote && convert.remote_query.to_api(remote), opts)
)
export const sync = (id: string, mright: Option<Mright>, opts: opts_abort) => (
    api_post("sync", { id, ...(mright ? { mright } : {}) }, {}, opts)
)

export const delete_sgroup = (id: string) => (
    api_post('delete', { id }, {})
)
export const create = (id: string, attrs: MonoAttrs) => (
    api_post('create', { id }, attrs)
)
export const modify_sgroup_attrs = (id: string, attrs: MonoAttrs) => (
    api_post('modify_sgroup_attrs', { id }, attrs)
)

export const search_sgroups = (search_params: { right: Right, search_token: string, sizelimit: number }) : Promise<SgroupsWithAttrs> => {
    let search_params_ = { ...search_params, sizelimit: "" + search_params.sizelimit }
    return api_get("search_sgroups", search_params_, {})
}
export const search_subjects = (search_params: { search_token: string, sizelimit: number, source_dn?: Dn, group_to_avoid?: string }, opts: opts_get) : Promise<PRecord<Dn, Subjects>> => {
    let search_params_ = { ...pickBy(search_params, val => val), sizelimit: "" + search_params.sizelimit }
    return api_get("search_subjects", search_params_, opts)
}
type id_to_dn = { id: string, dn: Dn, attrs: MonoAttrs, ssdn: Dn } | { id: string, error: "multiple_match" | "no_match" }
export const subject_ids_to_dns = (ids: string[], source_dn: Option<Dn>, opts: opts_post): Promise<id_to_dn[]> => (
    api_post("subject_ids_to_dns", source_dn ? { source_dn } : {}, ids, opts ?? {})
)

export const group_flattened_mright = (search_params: { id: string, mright: Mright, sizelimit: number, search_token: string }) : Promise<SubjectsAndCount> => {
    let search_params_ = remove_empty_params({ ...search_params, sizelimit: "" + search_params.sizelimit })
    return api_get("group_flattened_mright", search_params_, {})
}
export const sgroup_direct_rights = (id: string) : Promise<PRecord<Right, Subjects>> => (
    api_get("sgroup_direct_rights", { id }, {})
)
export const sgroup = (id: string) : Promise<SgroupAndMoreOut> => (
    api_get("sgroup", { id }, {})
)
export const sgroup_logs = async (id: string, bytes: number, opts?: { sync: true }) : Promise<{ last_log_date: Date, whole_file: boolean, logs: SgroupLog[] }> => {
    const search_params = { 
        id, bytes: ""+bytes,
        ...opts?.sync ? { sync: "true" } : {},
    }
    const r = await api_get("sgroup_logs", search_params, {})
    r.last_log_date = new Date(r.last_log_date)
    // @ts-expect-error
    r.logs.forEach(log => log.when = new Date(log.when))
    return r
}
export const mygroups = () : Promise<SgroupsWithAttrs> => (
    api_get("mygroups", {}, {})
)
export const config_ldap = () : Promise<LdapConfigOut> => (
    api_get("config/ldap", {}, { memoize: true })
)
export const config_remotes = () : Promise<{ remotes: Record<string, RemoteConfig>, additional_periodicities: string[] }> => (
    api_get("config/remotes", {}, { memoize: true })
)

export interface TestRemoteQuery {
    count: number,
    values: string[],
    values_truncated: boolean,
    ss_guess?: [ToSubjectSource, Subjects],
}
export const test_remote_query = (id: string, remote_query: RemoteQuery, opts: opts_abort): Promise<TestRemoteQuery> => (
    api_get('test_remote_query', { id, remote_query: JSON.stringify(convert.remote_query.to_api(remote_query)) }, opts)
)

export async function add_sscfg_dns(subjects: Subjects) {
    const sscfgs = (await config_ldap()).subject_sources
    forEach(subjects as Subjects_with_more, (attrs, dn) => {
        attrs.sscfg_dn = sscfgs.find(one => dn?.endsWith(one.dn))?.dn
    })
}
async function add_sscfg_dns_and_sort_field(subjects: Subjects) {
    const sscfgs = (await config_ldap()).subject_sources
    forEach(subjects as Subjects_with_more, (subject, dn) => {
        const i = sscfgs.findIndex(one => dn?.endsWith(one.dn))
        if (i >= 0) {
            const sscfg = sscfgs[i]
            subject.sscfg_dn = sscfg.dn
            subject.sort_field = i + ';' + at(subject.attrs, sscfg.display_attrs).join(';')
        }
    })
}

export async function add_sscfg_dns_and_sort(subjects: Subjects) {
    let subjects_ = subjects as Subjects_with_more
    await add_sscfg_dns_and_sort_field(subjects_)
    subjects_ = objectSortBy(subjects_, (subject, _) => subject.sort_field);
    forEach(subjects_, (attrs, _) => delete attrs.sort_field)
    return subjects_ as Subjects
}

export const convert = {
    remote_query: {
        from_api(remote: RemoteQuery) {
            remote.to_subject_source ??= { ssdn: '', id_attr: '' }
            remote.periodicity = remote.forced_periodicity ?? ''
        },
        to_api(remote: RemoteQuery): Partial<RemoteQuery> {
            const has_subject_source = remote.to_subject_source.ssdn
            remote.forced_periodicity = remote.periodicity === '' ? undefined : remote.periodicity
            return remote.isSql ? 
                pick(remote, 'remote_cfg_name', 'forced_periodicity', 'select_query', ...(has_subject_source ? ['to_subject_source'] : [])) :
                pick(remote, 'remote_cfg_name', 'forced_periodicity', 'filter', 'DN', 'attribute')
        },
    },
}
