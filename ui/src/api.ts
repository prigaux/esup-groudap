import { at, pickBy } from "lodash";
import { forEach } from "./helpers";
import { Dn, LdapConfigOut, MonoAttrs, Mright, MyMods, PRecord, RemoteConfig, RemoteSqlQuery, Right, SgroupAndMoreOut, SgroupLog, SgroupsWithAttrs, Subjects, SubjectsAndCount, Subjects_with_more } from "./my_types";

const api_url = document.location.href.replace(/[^/]*$/, 'api');

export async function login() {
    const cfg = await (await fetch("/api/config/public")).json()
    if (cfg && cfg.cas_prefix_url) {
        document.location.href = cfg.cas_prefix_url + "/login?service=" + encodeURIComponent(api_url + "/login?target=" + encodeURIComponent(document.location.pathname + document.location.search))
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
    throw new Error(response.toString())
}

function compute_url(api_function: string, search_params: Record<string, string>) {
    const url = new URL(api_url + '/' + api_function);
    for (const key in search_params) {
        url.searchParams.set(key, search_params[key]);
    }
    return url.toString();
}

let memoized: Record<string, any> = {}

async function api_(api_function: string, search_params: Record<string, string>, request_params: RequestInit, opts: { memoize?: true }) {
    const url = compute_url(api_function, search_params);
    if (opts.memoize && memoized[url]) {
        return memoized[url]
    }
    const json = await handle_response(await fetch(url, request_params));
    if (opts.memoize) {
        memoized[url]
    }
    return json
}

const remove_empty_params = (params: Record<string, string>) => (
    pickBy(params, (v) => v)
)

const api_get = (api_function: string, search_params: Record<string, string>, opts: { memoize?: true }) => (
    api_(api_function, search_params, {}, opts)
)

const api_post = (api_function: string, search_params: Record<string, string>, json_body: Record<string, any>) => {
    const body = JSON.stringify(json_body)
    return api_(api_function, search_params, { body, method: 'POST' }, {})
}

export const modify_members_or_rights = (id: string, mods: MyMods) => (
    api_post("modify_members_or_rights", { id }, mods)
)
export const modify_remote_sql_query = (id: string, remote: RemoteSqlQuery) => (
    api_post("modify_remote_sql_query", { id }, remote)
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
export const search_subjects = (search_params: { search_token: string, sizelimit: number, source_dn?: Dn }) : Promise<PRecord<Dn, Subjects>> => {
    let search_params_ = { ...search_params, sizelimit: "" + search_params.sizelimit }
    return api_get("search_subjects", search_params_, {})
}
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
export const sgroup_logs = async (id: string, bytes: number) : Promise<SgroupLog[]> => {
    const l = await api_get("sgroup_logs", { id, bytes: ""+bytes }, {})
    // @ts-expect-error
    return l.map(({ when, ...o }) => ({ when: new Date(when), ...o }))
}
export const mygroups = () : Promise<SgroupsWithAttrs> => (
    api_get("mygroups", {}, {})
)
export const config_subject_sources = () : Promise<LdapConfigOut> => (
    api_get("config/subject_sources", {}, { memoize: true })
)
export const config_remotes = () : Promise<Record<string, RemoteConfig>> => (
    api_get("config/remotes", {}, { memoize: true })
)

export async function add_sscfg_dns(subjects: Subjects) {
    const sscfgs = (await config_subject_sources()).subject_sources
    forEach(subjects as Subjects_with_more, (attrs, dn) => {
        attrs.sscfg_dn = sscfgs.find(one => dn?.endsWith(one.dn))?.dn
    })
}
export async function add_sscfg_dns_and_sort_field(subjects: Subjects) {
    const sscfgs = (await config_subject_sources()).subject_sources
    forEach(subjects as Subjects_with_more, (subject, dn) => {
        const i = sscfgs.findIndex(one => dn?.endsWith(one.dn))
        if (i >= 0) {
            const sscfg = sscfgs[i]
            subject.sscfg_dn = sscfg.dn
            subject.sort_field = i + ';' + at(subject.attrs, sscfg.display_attrs).join(';')
        }
    })
}