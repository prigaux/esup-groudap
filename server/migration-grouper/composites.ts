import { ensure_sgroup_object_classes, group2membersFilter, grouper_sql_query, to_id } from './migration_helpers';
import { throw_ } from '../helpers';
import migration_conf from './migration_conf';
import * as api_post from '../api_post';


async function handle_one(operation: string, group: string, left: string, right: string) {
	const id = to_id(group, false)
    const left_filter = group2membersFilter(left)
    const right_filter = group2membersFilter(right)

    const filter = 
        operation === 'union' ? `(|${left_filter}${right_filter})` :
        operation === 'intersection' ? `(&${left_filter}${right_filter})` :
        operation === 'complement' ? `(&${left_filter}(!${right_filter}))` :
        throw_(`unknown operation ${operation}`)

    await ensure_sgroup_object_classes(id)
    //console.log('handling', group, '=>', filter)
    await api_post.modify_remote_query_(id, {
        remote_cfg_name: migration_conf.main_ldap_remote_cfg_name,
        filter,        
    })
}

const query = /*sql*/`
SELECT composite_type, owner_group_name, left_factor_group_name, right_factor_group_name
FROM grouper_composites_v
`

export default async function () {
    for (const [operation, group, left, right] of await grouper_sql_query(query)) {
        await handle_one(operation, group, left, right)
    }
}
