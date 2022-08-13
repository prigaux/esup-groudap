/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import _ from "lodash";
import { promisify } from "util";
import conf from "./conf";
import * as ldp from "./ldap_wrapper"
import { before_and_after, strip_prefix, throw_ } from "./helpers";
import ldap_filter from "./ldap_filter";
import { get_subjects_ } from "./my_ldap_subjects";
import { Dn, DnsOpts, hMyMap, MyMap, Option, RemoteConfig, RemoteSqlQuery, Subjects, toDn, ToSubjectSource } from "./my_types";
import mysql from 'mysql'
// @ts-expect-error (@types/oracledb 5.2.x does not allow oracledb.getConnection)
import oracledb from 'oracledb'

const driver_query: Record<string, (remote: RemoteConfig, db_name: string, select_query: string) => Promise<string[]>> = {
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

async function raw_query(remote: RemoteConfig, db_name: string, select_query: string): Promise<string[]> {
    const f = driver_query[remote.driver]
    return await f(remote, db_name, select_query)
}

async function sql_values_to_dns_(ssdn: Dn, id_attr: string, sql_values: string[]) {
    const r: DnsOpts = {};
    for (const sql_values_ of _.chunk(sql_values, 10)) {
        const filter = ldap_filter.or(
            sql_values_.map(val => ldap_filter.eq(id_attr, val))
        );
        for (const e of await ldp.searchRaw(ssdn, filter, [""], {})) {
            r[toDn(e.dn)] = {}
        }
    }
    return r
}

const hToSubjectSource = {
    toString: (tss: ToSubjectSource) => (
        `${tss.ssdn}?${tss.id_attr}`
    ),
}

export const hRemoteSqlQuery = {
    toString: (rsq: RemoteSqlQuery) => {
        const opt = rsq.to_subject_source ?
            ` : subject=${hToSubjectSource.toString(rsq.to_subject_source)}` :
            "";
        return `sql: remote=${rsq.remote_cfg_name}${opt} : ${rsq.select_query}`
    }
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
)

function parse_to_subject_source(s: string): ToSubjectSource {
    const [ssdn, id_attr] = before_and_after(s, '?') ?? throw_("expected ou=xxx,dc=xxx?uid, got " + s)
    return { ssdn: toDn(ssdn), id_attr }
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
export const direct_members_to_remote_sql_query = (l : string[]) => (
    l.length === 1 ? parse_sql_url(l[0]) : undefined
)

export function query(remotes_cfg: MyMap<string, RemoteConfig>, remote: RemoteSqlQuery) {
    const remote_cfg = remotes_cfg[remote.remote_cfg_name] ?? throw_("internal error: unknown remote " + remote.remote_cfg_name)
    return raw_query(remote_cfg, remote_cfg.db_name, remote.select_query)
}

export async function sql_values_to_dns(remote: RemoteSqlQuery, sql_values: string[]): Promise<DnsOpts> {
    const to_ss = remote.to_subject_source
    if (to_ss) {
        return await sql_values_to_dns_(to_ss.ssdn, to_ss.id_attr, sql_values)
    } else {
        // the SQL query must return DNs
        return _.fromPairs(sql_values.map(dn => [dn, {}]))
    }
}

export interface TestRemoteQuerySql {
    count: number,
    values: string[],
    values_truncated: boolean,
    ss_guess: Option<[ToSubjectSource, Subjects]>,
}

export async function test_remote_query_sql(remote_sql_query: RemoteSqlQuery): Promise<TestRemoteQuerySql> {
    const all_values = await query(conf.remotes, remote_sql_query)
    const count = all_values.length;
    const max_values = 10;    
    const values = all_values.slice(0, max_values); // return an extract
    const ss_guess = count ? await guess_subject_source(values) : undefined
    return {
        count,
        values,
        values_truncated: count > max_values,
        ss_guess,
    }
}

async function guess_subject_source(values: string[]) {
    let best: Option<[number, [DnsOpts, Dn, string]]>;
    for (const sscfg of conf.ldap.subject_sources) {
        for (const id_attr of sscfg.id_attrs ?? []) {
            const dns = await sql_values_to_dns_(toDn(sscfg.dn), id_attr, values)
            const nb_dns = _.size(dns)
            if (nb_dns > (best?.[0] ?? 0)) {
                best = [nb_dns, [dns, toDn(sscfg.dn), id_attr]];
            }
        }
    }
    if (!best) return undefined
    const [dns, ssdn, id_attr] = best[1]
    const subjects = await get_subjects_(dns)
    const r: [ToSubjectSource, Subjects] = [ { ssdn, id_attr }, subjects ]
    return r
}
