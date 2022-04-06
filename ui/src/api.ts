import { at, pickBy } from "lodash";
import { forEach, objectSortBy } from "./helpers";
import { Dn, LdapConfigOut, MonoAttrs, Mright, MyMods, PRecord, RemoteConfig, RemoteSqlQuery, Right, SgroupAndMoreOut, SgroupLog, SgroupsWithAttrs, Subjects, SubjectsAndCount, Subjects_with_more, ToSubjectSource } from "./my_types";

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
    api_post("modify_remote_sql_query", { id }, convert.remote_sql_query.to_api(remote))
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
export const config_ldap = () : Promise<LdapConfigOut> => (
    api_get("config/ldap", {}, { memoize: true })
)
export const config_remotes = () : Promise<Record<string, RemoteConfig>> => (
    api_get("config/remotes", {}, { memoize: true })
)

export interface TestRemoteQuerySql {
    count: number,
    values: string[],
    values_truncated: boolean,
    ss_guess?: [ToSubjectSource, Subjects],
}
export const test_remote_query_sql = (id: string, remote_sql_query: RemoteSqlQuery): Promise<TestRemoteQuerySql> => (
    api_get('test_remote_query_sql', { id, remote_sql_query: JSON.stringify(convert.remote_sql_query.to_api(remote_sql_query)) }, {})
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
    remote_sql_query: {
        from_api(remote: RemoteSqlQuery) {
            remote.to_subject_source ||= { ssdn: '', id_attr: '' }
        },
        to_api(remote: RemoteSqlQuery): Partial<RemoteSqlQuery> {
            const { to_subject_source, ...rest } = remote
            return !to_subject_source.ssdn || !to_subject_source.id_attr ? rest : remote
        },
    },
}