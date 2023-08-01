import * as readline from 'node:readline/promises';
import * as ldapjs from 'ldapjs'
import * as ldapP from 'ldapjs-promise-disconnectwhenidle'
import * as ldp from "../ldap_read_search"
import conf from "../conf";
import { throw_ } from "../helpers";
import { Dn, Mright, MyMod, MyMods, Option, toDn } from "../my_types";
import { is_stem, stem_separator } from "../stem_helpers";
import migration_conf from "./migration_conf";
import { difference, mapValues } from 'lodash';
import { createReadStream } from 'node:fs';
import { sgroup_id_to_dn } from '../dn';
import { query_arrays, query_string_arrays } from '../sql';

const groups_dn = conf.ldap.groups_dn;

export function to_id(id: string, is_stem: boolean = false) {
    const separator = stem_separator()
    if (separator !== ':') {
        id = id.replace(/:/g, separator)
    }
    return id + (id && is_stem ? "." : "")
}

export function sgroup2dn(group: string, is_stem: boolean) {
	return toDn((group ? `cn=${to_id(group, is_stem)},` : "") + groups_dn)
}
export const group2dn = (group: string) => sgroup2dn(group, false)

export const group2membersFilter = (group: string) => (
    `(memberOf=${group2dn(group)})`
)

export function subject2dn(ss: string, subject: string) {
	if (ss === 'ldap') {
		subject = subject.replace(/@univ-paris1[.]fr$/, '');
		return toDn(`uid=${subject},ou=people,dc=univ-paris1,dc=fr`)
	} else if (ss === 'g:gsa') {
		return group2dn(subject);
	} else if (ss === 'ldap_applications') {
		return toDn(`cn=${subject},ou=admin,dc=univ-paris1,dc=fr`)
	} else if (ss === 'g:isa') {
        if (subject === 'GrouperAll') return group2dn(migration_conf.GrouperAll_group)
		// special global rights. TODO!
		return;
	} else if (ss === 'grouperExternal') {
		// ignored
		return;
	} else {
		throw `unknown subject source "${ss}"`;
	}
}

export const toMyMods = (mright: Mright, mod: MyMod, subject_dn: Dn): MyMods => (
    { [mright]: { [mod]: { [subject_dn]: {} } } }
)


export const grouperRight_to_groupaldRight_: Record<string, Mright | "ignore"> = {
    optin: "ignore",
    optout: "ignore",
    groupAttrRead: "reader",
    groupAttrReader: "reader",
    stemAttrRead: "reader",
    view: "reader",
    read: "reader",
    groupAttrUpdate: "updater",
    groupAttrUpdater: "updater",
    stemAttrUpdate: "updater",
    update: "updater",
    create: "admin",
    stem: "admin",
    admin: "admin",

    viewer: 'reader',
    member: 'member',
    reader: 'reader',
    updater: 'updater',
}

export const grouperRight_to_groupaldRight = (right: string) => (
    grouperRight_to_groupaldRight_[right] || throw_("unknown grouper privilege " + right)
)

export const tsv_nullable_string = 'NULL' as Option<string>
export async function read_and_parse_mysql_tsv<T extends {}>(types: T, file?: string): Promise<T[]> {
    const input = file ? createReadStream(file) : process.stdin
    const rl = readline.createInterface({ input });
    let l: T[] = []
    for await (const line of rl) {
        const values = line.split("\t")
        let i = 0
        const entry = mapValues(types, (type_) => {
            const s = values[i++].replace(/\\n/g, "\n").replace(/\\t/g, "\t")
            if (type_ === '') {
                return s
            } else if (type_ === tsv_nullable_string) {
                // NB: no way to diffentiate NULL and "NULL"
                return s === 'NULL'  ? undefined : s
            } else {
                throw "TODO"
            }
        }) as T
        l.push(entry)
    }
    return l
}

export async function ensure_sgroup_object_classes(id: string) {
    const group_dn = sgroup_id_to_dn(id)
    const current = await ldp.read_one_multi_attr__or_err(group_dn, 'objectClass')
    const to_add = difference(is_stem(id) ? conf.ldap.stem_object_classes : conf.ldap.group_object_classes, current)
    if (to_add.length) {
        await ldapP.modify(sgroup_id_to_dn(id), new ldapjs.Change({
            operation: 'add', modification: { objectClass: to_add }
        }))
    }
}

export async function grouper_sql_query(query: string) {
    const remote_cfg = migration_conf.grouper_sql_config
    return await query_arrays(remote_cfg, remote_cfg.db_name, query)
}

export async function grouper_sql_query_strings(query: string) {
    const remote_cfg = migration_conf.grouper_sql_config
    return await query_string_arrays(remote_cfg, remote_cfg.db_name, query)
}
