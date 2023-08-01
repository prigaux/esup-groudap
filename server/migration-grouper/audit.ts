import { action, log_sgroup_action } from '../api_log';
import { MyMod } from '../my_types';
import { group2dn, grouperRight_to_groupaldRight, grouper_sql_query, subject2dn, toMyMods, to_id } from './migration_helpers';
import { throw_ } from '../helpers';


// {"action":"create","when":"2023-06-25T16:54:02.552Z","who":"prigaux","ou":"testPRI2","description":"oo"}

async function handle_one(time: number, who: string, description: string, g_name4: string, g_name2: string) {    
    who = who.replace(/@univ-paris1.fr/, '')
    const when = new Date(time)
    
    let data: Record<string, any> = {}
    let id: string | undefined
    let action: action | undefined

    let m
    if (m = description.match(/^Deleted (group|stem): (.*)/)) {
        action = 'delete'; id = to_id(m[2], m[1] === 'stem')
    } else if (m = description.match(/^Added (group|stem): (.*)/)) {
        action = 'create'; id = to_id(m[2], m[1] === 'stem')
    } else if (m = description.match(/^Copy group (\S+) to name: (\S+), /)) {
        action = 'create'; id = to_id(m[1])
    } else if (m = description.match(/^Updated (group|stem): (\S*), /)) {
        action = 'modify_attrs'; id = to_id(m[2], m[1] === 'stem')
    } else if (m = description.match(/^(Added|Deleted) membership: group: (\S+), subject: (\S+?)[.](\S+), field: members$/)) {
        const mod: MyMod = m[1] === 'Added' ? 'add' : 'delete'

        const subject_dn = m[3] === 'g:gsa' ? group2dn(g_name4 || throw_(`expect g_name4 for ${description}`)) : subject2dn(m[3], m[4])
        if (!subject_dn) return;

        action = 'modify_members_or_rights'
        id = to_id(m[2])
        data = toMyMods('member', mod, subject_dn)
    } else if (m = description.match(/^(Added|Deleted) privilege: (group|stem): (\S+), subject: (\S+?)[.](\S+), privilege: (\S+)/)) {
        const privilege = grouperRight_to_groupaldRight(m[6])
        if (privilege === 'ignore') return;

        const mod: MyMod = m[1] === 'Added' ? 'add' : 'delete'

        const subject_dn = m[4] === "g:gsa" ? group2dn(g_name2 || throw_(`expect g_name2 for ${description}`)) : subject2dn(m[4], m[5])
        if (!subject_dn) return;

        action = 'modify_members_or_rights'
        id = to_id(m[3], m[2] === 'stem');
        data = toMyMods(privilege, mod, subject_dn)
    } else if (m = description.match(/^(Move|Copy) (?:group|stem) (\S+) to name: (\S+),/)) {
        // TODO
    } else if (m = description.match(/^(Added|Deleted) composite: (\S+) (?:is|was) (\S+) (union|complement|intersection) (\S+)/)) {
        // TODO
    } else if (description.match(/^inserted group attribute: grouperLoader|^(Updated|Deleted) group attribute: grouperLoader|^Assigned group type: |^Email addresses to invite: |, subject: grouperExternal[.]|^Updated attribute assignment value: Fields changed: valueString|^(Added|Deleted) attribute assignment$|^(Added|Deleted) attribute assignment value$|^Unasssigned group type/)) {
        // ignore
    } else {
        console.warn("ignoring audit line:", description)
    }
    if (action && id) {
        //console.log(id, JSON.stringify({ when, who, action, ...data }))
        await log_sgroup_action({ User: who }, id, action, undefined, data, when)
    }
}

const query = /*sql*/`
SELECT created_on, act_as_subject_id, audit.description, s4.name as g_name4, s2.name as g_name2
FROM grouper_audit_entry_v AS audit
LEFT JOIN grouper_members AS s4 ON (s4.id = audit.string04)
LEFT JOIN grouper_members AS s2 ON (s2.id = audit.string02)
WHERE act_as_subject_id != 'GrouperSystem'
`

export default async function () {
    for (const [ time, who, description, g_name4, g_name2 ] of await grouper_sql_query(query)) {
        await handle_one(time, who, description, g_name4, g_name2)
    }
}

