/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import express from 'express';
import session from 'express-session';
import _ from 'lodash';
import session_file_store from 'session-file-store';

import conf from './conf';
import { throw_ } from './helpers';
import { hRight, Right, hMright, Mright, LoggedUser } from './my_types';


export function session_store() {
    const FileStore = session_file_store(session);
    return session({
        genid(req: express.Request) {
            // to ease CAS back-channel SingleLogout, we use CAS service ticket as sessionID (as done in phpCAS)
            return req.query.ticket as string
        },
        store: new FileStore({ retries: 0, ...conf.session_store.file_store }), 
        cookie: { secure: 'auto' },
        resave: false, saveUninitialized: false,
        ...conf.session_store.options,
    });
}

export function logged_user(req: express.Request): LoggedUser {
    const bearer = req.get("Authorization")?.match(/^Bearer (.*)/)?.[1]
    if (bearer === conf.trusted_auth_bearer) {
        const User = req.get("X-Impersonate-User")
        return User ? { User } : { TrustedAdmin: true }
    } else {
        // @ts-expect-error (req.session is not typed)
        const User = req.session.user ?? throw_("Unauthorized")
        return { User }
    }
}

export function orig_url(req: express.Request) {
    let hostname = req.hostname

    let port = req.get('Host')?.match(/:(.*)$/)?.[1]
    if (hostname !== req.get('Host')?.replace(/:.*/, '')) {
        // proxy is trusted, trying to get the original port too
        port = req.get('X-Forwarded-Port')
    }
    if (port && !(port === '80' && req.protocol === 'http' || port === '443' && req.protocol === 'https')) {
        hostname += ":" + port
    }
    return req.protocol + '://' + hostname + req.originalUrl;
}

type QueryParamsGetters = Record<string, (val: string) => any>

const _query_params = (req: express.Request, wanted: QueryParamsGetters, optional: boolean) => (
    _.mapValues(wanted, (getter, param) => {
        const val: any = req.query[param]
        if (val === undefined) {
            if (!optional) throw "missing mandatory query param " + param
            return undefined
        }
        if (typeof val !== 'string') throw "query param " + param + " must be only once"

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return getter(val)
    })
)
export const query_params = <T extends QueryParamsGetters>(req: express.Request, wanted: T) => (
    _query_params(req, wanted, false) as { [P in keyof T]: ReturnType<T[P]> }
)
export const query_opt_params = <T extends QueryParamsGetters>(req: express.Request, wanted: T) => (
    _query_params(req, wanted, true) as Partial<{ [P in keyof T]: ReturnType<T[P]> }>
)
export const q = {
    int: (val: string) => (parseInt(val)),
    boolean: (val: string) => val === 'true',
    string: (val: string) => val,
    right: (val: string) => hRight.list().includes(val as any) ? val as Right : throw_("invalid right"),
    mright: (val: string) => hMright.list().includes(val as any) ? val as Mright : throw_("invalid mright"),
    json: <T>() => (val: string) => JSON.parse(val) as T, // empty param useful since q.json<Foo> is not allowed whereas q.json<Foo>() IS
}

const http_statuses: Record<string, number> = {
    "Bad Request": 400,
    "Unauthorized": 401,
    "Forbidden": 403,
    "OK": 200,
}

export const handleJsonP = (action: (req: express.Request) => Promise<any>, default_response : any = undefined) => (req: express.Request, res: express.Response) => {
    // NB: ignore promise return value
    void (async function() {
        const logPrefix = req.method + " " + req.path + ":";
        try {
            const r = await action(req)
            //console.log(logPrefix, r);
            res.json(r ?? default_response);
        } catch (err : any) {
            console.log(logPrefix, err);
            const msg = "" + err;
            res.status(http_statuses[msg] || 500);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            res.json({ error: true, msg, stack: err?.stack});
        }
    })();
}

export const handleJson = (action: (req: express.Request) => any) => (
    handleJsonP((req) => Promise.resolve(action(req)))
)

export const handleVoidP = (action: (req: express.Request) => Promise<void>) => (
    handleJsonP(action, { "ok": true })
)