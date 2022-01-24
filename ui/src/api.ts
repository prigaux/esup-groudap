import { Dictionary, pickBy } from "lodash";
import { Mright, MyMods, PRecord, Right, SgroupAndMoreOut, SgroupsWithAttrs, Subjects, SubjectsAndCount, SubjectSourceConfig } from "./my_types";

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

export const search_sgroups = (search_params: { right: Right, search_token: string, sizelimit: number }) : Promise<SgroupsWithAttrs> => {
    let search_params_ = { ...search_params, sizelimit: "" + search_params.sizelimit }
    return api_get("search_sgroups", search_params_, {})
}
export const search_subjects = (search_params: { search_token: string, sizelimit: number, source_dn?: string }) : Promise<Record<Right, Subjects>> => {
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
export const mygroups = () : Promise<SgroupsWithAttrs> => (
    api_get("mygroups", {}, {})
)
export const config_subject_sources = () : Promise<SubjectSourceConfig[]> => (
    api_get("config/subject_sources", {}, { memoize: true })
)