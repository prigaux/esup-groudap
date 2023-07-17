/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import _ from "lodash";
import mysql from 'mysql'
// @ts-expect-error (@types/oracledb 5.2.x does not allow oracledb.getConnection)
import oracledb from 'oracledb'
import { promisify } from "util";

import * as ldp from "./ldap_read_search"
import * as ldpSubject from './ldap_subject'
import conf from "./conf";
import ldap_filter from "./ldap_filter";
import { before_and_after, strip_prefix, throw_ } from "./helpers";
import { Dn, DnsOpts, hMyMap, MyMap, Option, RemoteSqlConfig, remoteSqlDrivers, RemoteSqlQuery, Subjects, toDn, ToSubjectSource } from "./my_types";
import { exact_dn_to_subject_source_cfg } from "./dn";

const driver_query: Record<string, (remote: RemoteSqlConfig, db_name: string, select_query: string) => Promise<string[]>> = {
    mysql: async (remote, db_name, select_query) => {
        const connection = mysql.createConnection({
            host     : remote.host,
            user     : remote.user,
            password : remote.password,
            port     : remote.port,
            database : db_name,
        });
        const connect = promisify(connection.connect).bind(connection)
        const query = promisify(connection.query).bind(connection)
        const end = promisify(connection.end).bind(connection)

        await connect()
        const rows = await query(select_query) as MyMap<string, unknown>[]
        await end()

        return rows.map(hMyMap.firstValue) as string[]
    },
    oracle: async (remote, db_name, select_query) => {
        const port_string = remote.port ? `:${remote.port}` : ""
        const conn = await oracledb.getConnection({ user: remote.user, password: remote.password, connectString: `${remote.host}${port_string}/${db_name}` })
        const r = await conn.execute(select_query) as { rows: string[][] }
        return r.rows.map(e => e[0])
    },
};

async function raw_query(remote: RemoteSqlConfig, db_name: string, select_query: string): Promise<string[]> {
    const f = driver_query[remote.driver]
    return await f(remote, db_name, select_query)
}

async function sql_values_to_dns_(ssdn: Dn, id_attrs: string[], sql_values: string[]) {
    const r: DnsOpts = {};
    for (const sql_values_ of _.chunk(sql_values, 10)) {
        const filter = ldap_filter.or(
            sql_values_.flatMap(val => 
                id_attrs.map(id_attr => ldap_filter.eq(id_attr, val))
            )
        );
        for (const e of await ldp.searchRaw(ssdn, filter, [""], {})) {
            r[toDn(e.dn)] = {}
        }
    }
    return r
}

const hToSubjectSource = {
    /** NB: syntax inspired by "o=Example?uid" in Apache HTTPD AuthLDAPURL */
    toString: (tss: ToSubjectSource) => (
        `${tss.ssdn}?${tss.id_attr || '*'}`
    ),
}

export const to_sql_url = (rsq: RemoteSqlQuery) => {
        const opt = rsq.to_subject_source ?
            ` : subject=${hToSubjectSource.toString(rsq.to_subject_source)}` :
            "";
        return `sql: remote=${rsq.remote_cfg_name}${opt} : ${rsq.select_query}`
}

function strip_prefix_and_trim(s: string, prefix: string): Option<string> {
    return strip_prefix(s, prefix)?.trimStart()
}
function get_param(param_name: string, s: string): Option<[string, string]> {
    console.log("=>>>", s)
    return strip_prefix(s, param_name + '=')
        ?.oMap(s => before_and_after(s, ':'))
        ?.oMap(([param, rest]) => [ param.trimEnd(), rest.trimStart() ])
}

const optional_param = (param_name: string, s: string): [Option<string>, string] => (
    get_param(param_name, s) ?? [undefined, s]
);

/**
 * @param s - string format inspired by "o=Example?uid" in Apache HTTPD AuthLDAPURL
 */
function parse_to_subject_source(s: string): ToSubjectSource {
    const [ssdn, id_attr] = before_and_after(s, '?') ?? throw_("expected ou=xxx,dc=xxx?uid, got " + s)
    return { ssdn: toDn(ssdn), id_attr: id_attr === '*' ? undefined : id_attr }
}

export const parse_sql_url = (url: string): Option<RemoteSqlQuery> => (
    strip_prefix_and_trim(url, "sql:")?.oMap(rest => {
        const [remote_cfg_name, rest_] = get_param("remote", rest) ?? throw_("remote= is missing in " + url)
        const [subject, select_query] = optional_param("subject", rest_)
        return {
            select_query,
            remote_cfg_name,
            to_subject_source: subject?.oMap(parse_to_subject_source),
        }
    })
)

const to_RemoteSqlConfig = (remote_cfg_name: string): Option<RemoteSqlConfig> => {
    const remote_cfg = conf.remotes[remote_cfg_name] ?? throw_("internal error: unknown remote " + remote_cfg_name)
    if (remoteSqlDrivers.includes(remote_cfg.driver as any)) {
        return remote_cfg as RemoteSqlConfig
    }
    return undefined
}

export function sql_query(remote: RemoteSqlQuery) {
    const remote_cfg = to_RemoteSqlConfig(remote.remote_cfg_name) ?? throw_("internal error: remote is not SQL " + remote.remote_cfg_name)
    return raw_query(remote_cfg, remote_cfg.db_name, remote.select_query)
}

const to_ss_to_id_attrs = (to_ss: ToSubjectSource) => {
    const sscfg = exact_dn_to_subject_source_cfg(to_ss.ssdn) || throw_(`invalid remote query: no id_attr and ${to_ss.ssdn} is not listed in conf.ldap.subject_sources`)
    return sscfg.id_attrs || throw_("no id_attrs for " + sscfg.name + " but needed for remote query on DN " + to_ss.ssdn)
}

export async function sql_values_to_dns(to_ss: Option<ToSubjectSource>, sql_values: string[]): Promise<DnsOpts> {
    if (to_ss) {
        const id_attrs = to_ss.id_attr ? [to_ss.id_attr] : to_ss_to_id_attrs(to_ss)
        return await sql_values_to_dns_(to_ss.ssdn, id_attrs, sql_values)
    } else {
        // the SQL query must return DNs
        return _.fromPairs(sql_values.map(dn => [dn, {}]))
    }
}

export async function guess_subject_source(values: string[]) {
    if (values.every(value => value.endsWith(conf.ldap.base_dn))) {
        // all valeurs are DNs, no subject_source needed
        return undefined
    }
    let best: Option<[number, [DnsOpts, Dn, string]]>;
    for (const sscfg of conf.ldap.subject_sources) {
        for (const id_attr of sscfg.id_attrs ?? []) {
            const dns = await sql_values_to_dns_(toDn(sscfg.dn), [id_attr], values)
            const nb_dns = _.size(dns)
            if (nb_dns > (best?.[0] ?? 0)) {
                best = [nb_dns, [dns, toDn(sscfg.dn), id_attr]];
            }
        }
    }
    if (!best) return undefined
    const [dns, ssdn, id_attr] = best[1]
    const subjects = await ldpSubject.get_subjects_(dns)
    const r: [ToSubjectSource, Subjects] = [ { ssdn, id_attr }, subjects ]
    return r
}
