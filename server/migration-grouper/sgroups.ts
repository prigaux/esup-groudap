import _ from "lodash"

import { grouper_sql_query_strings, to_id } from './migration_helpers';
import { create_sgroup, is_sgroup_existing } from '../ldap_sgroup_read_search_modify';
import { hMyMap } from "../my_types";

async function create_stems() {
    //const l = await read_and_parse_mysql_tsv({ name: '', display_name: '', description: tsv_nullable_string })
    const l = await grouper_sql_query_strings('SELECT name, display_name, description FROM grouper_stems_v')
    for (const [name, display_name, description] of l) {        
        if (name && name !== ':' && !name.startsWith('etc')) {
            const id = to_id(name, true)
            if (await is_sgroup_existing(id)) {
                console.log("skipping already migrated stem", name)
            } else {
                console.log("creating stem", name, display_name, description)
                await create_sgroup(id, hMyMap.compact({ ou: display_name, description: description }))
            }
        }
    }
}

async function create_groups() {
    const l = await grouper_sql_query_strings('SELECT name, display_name, description FROM grouper_groups_v')
    for (const [name, display_name, description] of l) {        
        if (name && name !== ':' && !name.startsWith('etc')) {
            const id = to_id(name, false)
            if (await is_sgroup_existing(id)) {
                console.log("skipping already migrated group", name)
            } else {
                console.log("creating group", name, display_name, description)
                await create_sgroup(id, hMyMap.compact({ ou: display_name, description: description }))
            }
        }
    }
}

export default async function () {
    await create_stems()
    await create_groups()
}
