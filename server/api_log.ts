import * as fs from 'fs'
import { promisify } from 'util'

import conf from './conf'
import { hLoggedUser, LoggedUser, Option } from './my_types';

function sgroup_log_file(log_dir: string, id: string): string {
    id = id.replace('/', "_"); // it should not be necessary but...
    return `${log_dir}/${id}.jsonl`
}

function blank_partial_line(b: Buffer) {
    const [lf, space] = ["\n", " "].map(s => s.charCodeAt(0))
    for (let i = 0; b[i] !== lf; i++) b[i] = space
}

async function read_full_lines(file_path: string, bytes: number) {
    const f = await promisify(fs.open)(file_path, 'r')
    const stat = await promisify(fs.fstat)(f)
    const whole_file = bytes > stat.size

    const buffer = Buffer.alloc(bytes)
    await promisify(fs.read)(f, whole_file ? { buffer } : { buffer, length: bytes, position: stat.size - bytes })

    if (!whole_file) blank_partial_line(buffer)

    return buffer
}

function parse_jsonl(jsonl: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse('[' + jsonl.replace("\n", ",") + ']') as any[]
}

async function read_jsonl(file_path: string, bytes: number) {
    const jsonl = await read_full_lines(file_path, bytes)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return parse_jsonl(jsonl.toString())
}

async function audit(file: string, msg: string) {
    await promisify(fs.writeFile)(file, msg + "\n", { flag: "a" })
}

/**
 * Read log entries
 * @param id - sgroup identifier
 * @param bytes - maximum number of bytes to read
 * @returns log entries
 */
export async function get_sgroup_logs(id: string, bytes: number) {
    if (!conf.log_dir) throw `you must configure conf.log_dir first`
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await read_jsonl(sgroup_log_file(conf.log_dir, id), bytes)
}

export type action = 'create' | 'modify_attrs' | 'delete' | 'modify_members_or_rights' | 'modify_remote_sql_query'

/**
 * Add a log entry
 * @param user - who did the action
 * @param id - group/stem identifier
 * @param action - one of "create", "delete"...
 * @param msg - optional message explaining why the user did this action
 * @param data - info about this action (content depends on the action)
 */
export async function log_sgroup_action(user: LoggedUser, id: string, action: action, msg: Option<string>, data: Record<string, any>) {
    if (conf.log_dir) {
        const who = hLoggedUser.toString(user)
        const when = new Date()
        await audit(
            sgroup_log_file(conf.log_dir, id),
            JSON.stringify({ action, when, who, msg, ...data }))
    }
}

// TODO log group sync date  errs

export const export_for_tests = { parse_jsonl, blank_partial_line }
