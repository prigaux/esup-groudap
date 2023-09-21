import _ from 'lodash'
import { ensure_sgroup_object_classes, grouperRight_to_groupaldRight, grouper_sql_query, subject2dn, to_id } from "./migration_helpers";
import { is_sgroup_matching_filter, modify_direct_members_or_rights } from '../ldap_sgroup_read_search_modify';
import { hMright } from '../my_types';
import migration_conf from './migration_conf';
import ldap_filter from '../ldap_filter';
import { dn_to_url } from '../dn';

async function handle_one(group: string, right: string, ss: string, subject: string) {
    if (group === migration_conf.wheel_group && right === 'members') {
        group = '';
        right = 'admins';
    }

    let is_stem = false
    let sgroup = group

    // gérer la convention Paris1 pour mettre des droits sur les stems
    let m = group.match(/^etc:stem-rights:(.*):stem-(readers|updaters|admins)$/)
    if (m) {
        if (mright !== 'member') return
        const [, stemId, right] = m
        sgroup = stemId
        is_stem = true
        mright = grouperRight_to_groupaldRight(right.replace(/s$/, ''))
    } else if (group.match(/^etc:/)) {
        return;
    }

    const right_ = grouperRight_to_groupaldRight(right.replace(/s$/, ''))
    if (right_ === 'ignore') return;
    const attr = hMright.to_attr(right_)
    const subject_dn = subject2dn(ss, subject);

    if (subject_dn) {
        const id = to_id(sgroup, is_stem)
        await ensure_sgroup_object_classes(id)
        if (await is_sgroup_matching_filter(id, ldap_filter.eq(attr, dn_to_url(subject_dn)))) {
            //console.log("skipping", id, right_, subject_dn)
        } else {
            console.log("adding", id, right_, subject_dn)
            await modify_direct_members_or_rights(id, { [right_]: { add: { [subject_dn]: { } } } })
        }
    }
}

const query = /*sql*/`
SELECT 
    grouper_groups.name AS name, grouper_fields.name AS right_, subject_source AS ss, 
    if(SUBJECT_SOURCE = "g:gsa", grouper_members.NAME, grouper_members.subject_id) AS subject
FROM grouper_memberships 
INNER JOIN grouper_fields ON (grouper_memberships.field_id = grouper_fields.id)
INNER JOIN grouper_members ON (grouper_memberships.member_id = grouper_members.id) 
INNER JOIN grouper_groups ON (grouper_groups.id = owner_id) 
WHERE grouper_groups.id NOT IN (
    SELECT g.id 
    FROM grouper_attributes_legacy 
    INNER JOIN grouper_groups AS g ON (group_id = g.id)
    INNER JOIN grouper_fields_legacy f ON (field_id = f.id) WHERE f.name = "grouperLoaderQuery"
)
AND grouper_groups.id NOT IN (
    SELECT distinct g.id 
    FROM grouper_groups AS g, grouper_attribute_assign AS attrParent, grouper_attribute_assign_value AS val, grouper_attribute_assign AS attr
    WHERE g.id = attrParent.owner_group_id 
        AND attrParent.id = attr.owner_attribute_assign_id
        AND val.attribute_assign_id = attr.id
        AND attr.attribute_def_name_id IN (
            SELECT id FROM grouper_attribute_def_name WHERE name IN ("etc:legacy:attribute:legacyAttribute_grouperLoaderQuery", "etc:attribute:loaderLdap:grouperLoaderLdapFilter")
        )
)
AND mship_type = "immediate"
ORDER BY grouper_groups.name

-- AND grouper_groups.name = "applications:ad:ces-nasusers"
`

export default async function () {
    for (const [ group, right, ss, subject ] of await grouper_sql_query(query)) {
      await handle_one(group, right, ss, subject)
    }
}
