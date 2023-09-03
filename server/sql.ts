import _ from "lodash";
import mysql from 'mysql'
import * as pg from 'pg'
// @ts-expect-error (@types/oracledb 5.2.x does not allow oracledb.getConnection)
import oracledb from 'oracledb'
import { promisify } from "util";

import { hMyMap, MyMap, RemoteSqlConfig, RemoteSqlDriver } from "./my_types";

async function postgresql_client<T>(remote: RemoteSqlConfig, db_name: string, f: (client: pg.Client) => Promise<T>): Promise<T> {
    const client = new pg.Client({
        host     : remote.host,
        user     : remote.user,
        password : remote.password,
        port     : remote.port,
        database : db_name,
    })
    await client.connect()

    try {
        return await f(client)
    } finally {
        await client.end()    
    }
}

const driver_query_objects: MyMap<RemoteSqlDriver, (remote: RemoteSqlConfig, db_name: string, select_query: string) => Promise<MyMap<string, unknown>[]>> = {
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

        return rows
    },
    postgresql: async (remote, db_name, select_query) => {
        return postgresql_client(remote, db_name, async (client) => (
            (await client.query(select_query)).rows
        ))
    },
}

const driver_query_arrays: MyMap<RemoteSqlDriver, (remote: RemoteSqlConfig, db_name: string, select_query: string) => Promise<unknown[][]>> = {
    oracle: async (remote, db_name, select_query) => {
        const port_string = remote.port ? `:${remote.port}` : ""
        const conn = await oracledb.getConnection({ user: remote.user, password: remote.password, connectString: `${remote.host}${port_string}/${db_name}` })
        const r = await conn.execute(select_query) as { rows: unknown[][] }
        return r.rows
    },
    postgresql: async (remote, db_name, select_query) => {
        return postgresql_client(remote, db_name, async (client) => (
            (await client.query({ text: select_query, rowMode: 'array' })).rows
        ))
    },
};

export async function query_objects(remote: RemoteSqlConfig, db_name: string, select_query: string) {
    const to_objects = driver_query_objects[remote.driver]
    if (to_objects) {
        return await to_objects(remote, db_name, select_query)
    }
    throw "query_objects: not handled SQL driver " + remote.driver
}

export async function query_arrays(remote: RemoteSqlConfig, db_name: string, select_query: string) {
    const to_arrays = driver_query_arrays[remote.driver]
    if (to_arrays) {
        return await to_arrays(remote, db_name, select_query)
    }
    const to_objects = driver_query_objects[remote.driver]
    if (to_objects) {
        const l = await to_objects(remote, db_name, select_query)
        return l.map(Object.values)
    }
    throw "unknown SQL driver " + remote.driver
}

export async function query_one_values(remote: RemoteSqlConfig, db_name: string, select_query: string): Promise<unknown[]> {
    const to_arrays = driver_query_arrays[remote.driver]
    if (to_arrays) {
        const l = await to_arrays(remote, db_name, select_query)
        return l.map(e => e[0])
    }    
    const to_objects = driver_query_objects[remote.driver]
    if (to_objects) {
        const l = await to_objects(remote, db_name, select_query)
        return l.map(hMyMap.firstValue)
    }
    throw "unknown SQL driver " + remote.driver
}

function check_is_string(val: unknown) {
    if (val !== null && typeof val !== 'string') throw "invalid remote query: it should return strings, not " + typeof val + ": " + val
}

function to_string_objects(vals: MyMap<string, unknown>[]) {
    vals.forEach(o => hMyMap.each(o, check_is_string))
    return vals as MyMap<string, string>[]
}
export const query_string_objects = async (remote: RemoteSqlConfig, db_name: string, select_query: string) => (
    to_string_objects(await query_objects(remote, db_name, select_query))
)

function to_string_arrays(vals: string[][]) {
    vals.forEach(o => o.forEach(check_is_string))
    return vals as string[][]
}
export const query_string_arrays = async (remote: RemoteSqlConfig, db_name: string, select_query: string) => (
    to_string_arrays(await query_arrays(remote, db_name, select_query))
)

function unknowns_to_strings(vals: unknown[]) {
    vals.forEach(check_is_string)
    return vals as string[]
}
export const query_strings = async (remote: RemoteSqlConfig, db_name: string, select_query: string) => (
    unknowns_to_strings(await query_one_values(remote, db_name, select_query))
)
