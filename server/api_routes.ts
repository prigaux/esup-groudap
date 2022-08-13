import express from 'express';
import { throw_ } from './helpers';
import * as cas_auth from './cas_auth'
import * as test_data from './test_data'
import * as api_get from './api_get'
import * as api_post from './api_post'
import * as cache from './cache'
import conf from './conf';
import { hLdapConfig, MonoAttrs, MyMods, RemoteSqlQuery, toDn } from './my_types';
import { query_params, q, orig_url, logged_user, query_opt_params, handleJsonP, handleVoidP, handleJson } from './express_helpers';

const api = express.Router();

// eslint-disable-next-line @typescript-eslint/no-misused-promises
api.get("/login", async (req, res) => {
    try {
        const { target, ticket } = query_params(req, { target: q.string, ticket: q.string })
        if (!target.startsWith('/') || target.startsWith("//")) {
            throw `invalid target ${target}, it must be a path-absolute url`
        }
        const service = orig_url(req).match(/(.*)ticket=/)?.[1] ?? throw_("weird login url");
        const user = await cas_auth.validate_ticket(conf.cas.prefix_url, service, ticket)
        // @ts-expect-error (req.session is not typed)
        req.session.user = user;
        res.redirect(target)
    } catch (e) {
        console.error(e)
        res.status(500);
        res.send("internal error")
    }
})

api.get("/set_test_data", handleVoidP(test_data.set))
api.get("/clear_test_data", handleVoidP(test_data.clear))
api.get("/add_test_data", handleVoidP(test_data.add))

api.post("/create", handleVoidP(async (req) => {
    const { id } = query_params(req, { id: q.string })
    await api_post.create(logged_user(req), id, req.body as MonoAttrs)
}))

api.post("/modify_sgroup_attrs", handleVoidP(async (req) => {
    const { id } = query_params(req, { id: q.string })
    await api_post.modify_sgroup_attrs(logged_user(req), id, req.body as MonoAttrs)
}))

api.post("/delete", handleVoidP(async (req) => {
    const { id } = query_params(req, { id: q.string })
    await api_post.delete_(logged_user(req), id)
}))

api.post("/modify_members_or_rights", handleVoidP(async (req) => {
    const { id } = query_params(req, { id: q.string })
    const { msg } = query_opt_params(req, { msg: q.string })
    await api_post.modify_members_or_rights(logged_user(req), id, req.body as MyMods, msg)
}))

api.post("/modify_remote_sql_query", handleVoidP(async (req) => {
    const { id } = query_params(req, { id: q.string })
    const { msg } = query_opt_params(req, { msg: q.string })
    await api_post.modify_remote_sql_query(logged_user(req), id, req.body as RemoteSqlQuery, msg)
}))

api.get("/test_remote_query_sql", handleJsonP(async (req) => {
    const { id, remote_sql_query } = query_params(req, { id: q.string, remote_sql_query: q.json<RemoteSqlQuery>() })
    return await api_get.test_remote_query_sql(logged_user(req), id, remote_sql_query)
}))

api.get("/sgroup", handleJsonP(async (req) => {
    const { id } = query_params(req, { id: q.string })
    return await api_get.get_sgroup(logged_user(req), id)
}))

api.get("/sgroup_direct_rights", handleJsonP(async (req) => {
    const { id } = query_params(req, { id: q.string })
    return await api_get.get_sgroup_direct_rights(logged_user(req), id)
}))

api.get("/group_flattened_mright", handleJsonP(async (req) => {
    const { id, mright } = query_params(req, { id: q.string, mright: q.mright })
    const { search_token, sizelimit } = query_opt_params(req, { search_token: q.string, sizelimit: q.int })
    return await api_get.get_group_flattened_mright(logged_user(req), id, mright, search_token, sizelimit)
}))

api.get("/sgroup_logs", handleJsonP(async (req) => {
    const { id, bytes } = query_params(req, { id: q.string, bytes: q.int })
    return await api_get.get_sgroup_logs(logged_user(req), id, bytes)
}))

api.get("/search_sgroups", handleJsonP(async (req) => {
    const { right, search_token, sizelimit } = query_params(req, { right: q.right, search_token: q.string, sizelimit: q.int })
    return await api_get.search_sgroups(logged_user(req), right, search_token, sizelimit)
}))

api.get("/mygroups", handleJsonP(async (req) => {
    return await api_get.mygroups(logged_user(req))
}))

api.get("/clear_cache", () => {
    cache.clear_all();
})

api.get("/search_subjects", handleJsonP(async (req) => {
    const { search_token, sizelimit } = query_params(req, { search_token: q.string, sizelimit: q.int })
    const { source_dn } = query_opt_params(req, { source_dn: q.string })
    return await api_get.api_search_subjects(logged_user(req), search_token, sizelimit, source_dn?.oMap(toDn))
}))

api.get("/config/public", handleJson(() => ({ "cas_prefix_url": conf.cas.prefix_url })))
api.get("/config/ldap", handleJson(() => hLdapConfig.to_js_ui(conf.ldap)))
api.get("/config/remotes", handleJson(() => conf.remotes))

export default api
