import * as process from 'node:process';
import * as properties from 'java-properties'
import * as xml2js from 'xml2js'
import conf from '../conf'
import { MyMap, Option, RemoteConfig, RemoteLdapConfig, RemoteLdapQuery, RemoteQuery, RemoteSqlConfig, RemoteSqlDriver, RemoteSqlQuery, hMyMap, toDn } from '../my_types';
import { ensure_sgroup_object_classes, grouper_sql_query_strings, to_id } from './migration_helpers';
import { Dictionary, countBy, fromPairs, groupBy, invert, isEmpty, mapValues, maxBy, pickBy, toPairs } from 'lodash';
import assert from 'node:assert';
import { is, throw_ } from '../helpers';
import { Periodicity } from '../periodicity';
import migration_conf from './migration_conf';
import { readFileSync } from 'node:fs';
import * as api_post from '../api_post';


function from_intervalSeconds(s: string): Periodicity {
    const m: MyMap<string, Periodicity> = { 
        "600": "toutes les 10 minutes", 
        "3600": "toutes les heures",
        "86400": "tous les jours",
    }
    return m[s] || throw_("from_intervalSeconds: not implemented " + s)
}

function from_quartzCron(s: string): Periodicity {
    let m
    const pad = (s: string) => (s.match(/^\d($|[/])/) ? '0' : '') + s
    if (m = s.match(/^\d+ 0[/](\d+) [*] [*] [*] [?]/)) {
        return `toutes les ${BigInt(m[1])} minutes`
    } else if (m = s.match(/^\d+ (\d+) [*] [*] [*] [?]/)) {
        return `toutes les heures`
    } else if (m = s.match(/^\d+ (\d+) (\d+) [*] [*] [?]/)) {
        // @ts-expect-error
        return `tous les jours à ${m[2]}h${pad(m[1] || '00')}`
    } else if (s.match(/(30|31) 2 [?]$/)) {
        return "jamais"
    } else {
        throw "from_quartzCron: not implemented " + s
    }
}

assert.equal(from_quartzCron('0 0/5 * * * ?'), 'toutes les 5 minutes')
assert.equal(from_quartzCron('1 30 * * * ?'), 'toutes les heures')
assert.equal(from_quartzCron('0 0 6 * * ?'), 'tous les jours à 6h00')
assert.equal(from_quartzCron('0 30 6 * * ?'), 'tous les jours à 6h30')
assert.equal(from_quartzCron('0 0 5 31 2 ?'), 'jamais')


type raw_entry = { url: string, user: string, pass:string, isSql: boolean }

function get_grouper_loader_properties(file: string, sources: Dictionary<RemoteLdapConfig>) {
    // Reference a properties file
    var values = properties.of(file);
    
    let fullnames: MyMap<string, string> = {}

    // grouper utilise un namespace différent pour les accès LDAP et les accès base de données
    // par défaut le script de migration va utiliser le premier nom court disponible, puis utiliser un nom long avec le type d'accès comme préfixe
    // NB : migration_conf.remap_remote_cfg_name permet de forcer un nom pour type+nom
    const unique_name = (type_: string, name: string) => {
        const fullname = `${type_}_${name}`
        const name_ = migration_conf.remap_remote_cfg_name[type_][name] ?? name
        if (!fullnames[name_]) {
            // we are the first with this shortname, mark it at ours!
            fullnames[name_] = fullname
        }
        return fullnames[name_] === fullname ? /* we own the shortname */ name_ : fullname
    }
    hMyMap.each(sources, (_, name) => unique_name('ldap', name))

    let entries: MyMap<string, raw_entry> = {}
    for (const key of values.getKeys()) {
        const m = key.match(/^(db|ldap)[.]([^.]*)[.](url|user|pass)/)
        if (m) {
            const [, type_, name, field] = m;
            const entry = entries[unique_name(type_, name)] ||= {} as raw_entry
            entry.isSql = type_ === 'db'
            // @ts-expect-error
            entry[field] = values.get(key)
        } else {
            console.warn("get_grouper_loader_properties: ignoring", key)
        }
    }
    let remote_configs = hMyMap.mapValues(entries, from_raw_remote_config)

    hMyMap.each(sources, (remote_config, name) => {
        remote_configs[unique_name('ldap', name)] = remote_config
    })

    return { remote_configs, fullname2name: invert(fullnames) }
}

const query = /*sql*/`
SELECT def.name AS field, g.name AS group_, val.value_string AS value
FROM grouper_groups AS g
INNER JOIN grouper_attribute_assign AS attrParent ON (g.id = attrParent.owner_group_id)
INNER JOIN grouper_attribute_assign AS attr ON (attrParent.id = attr.owner_attribute_assign_id)
INNER JOIN grouper_attribute_assign_value AS val ON (attr.id = val.attribute_assign_id)
INNER JOIN grouper_attribute_def_name AS def ON (attr.attribute_def_name_id = def.id)
`

async function get_grouper_loader_groups() {
    let l: MyMap<string, MyMap<string, string>> = {}
    for (const [field, group, value] of await grouper_sql_query_strings(query)) {
        const entry = l[group] ||= { group: group }
        const field_ = field
            .replace(/^etc:legacy:attribute:legacyAttribute_/, '').replace(/^etc:attribute:loaderLdap:/, '')
            .replace(/^grouperLoader/, '')
        entry[field_] = value
    }
    return l
}

const add_periodicity = (periodicities: Dictionary<Option<Periodicity>>) => (remote: RemoteLdapConfig | RemoteSqlConfig, remote_cfg_name: string): RemoteConfig => ({
    ...remote,
    periodicity: periodicities[remote_cfg_name] || migration_conf.default_periodicity_if_remote_config_is_unused
})

const from_raw_remote_config = ({ isSql, url, user, pass: password } : raw_entry) => {
    let m;
    //if (!url) return undefined
    if (isSql) {
        let driver, host, port, db_name
        if (m = url.match(/^jdbc:(oracle):thin:@(.*?):(\d+):(.*)$/)) {
            [, driver, host, port, db_name] = m
        } else if (m = url.match(/^jdbc:(mysql|postgresql):[/][/]([^/:]*)(:(\d+))?[/]([^?]*)/)) {
            [, driver, host, , port, db_name] = m
        } else if (m = url.match(/^jdbc:(sqlserver):[/][/](.*?);databaseName=(.*)/)) {
            [, driver, host, db_name] = m
        } else {
            throw "TODO " + url
        }
        return is<RemoteSqlConfig>({
            driver: driver as RemoteSqlDriver,
            host, ...(port ? { port: parseInt(port) } : {}),
            user, password,
            db_name,
        })
    } else {
        if (m = url.match(/^(ldap:[/][/][^/]*)[/]([^?]*)/)) {
            return is<RemoteLdapConfig>({
                driver: 'ldap',
                connect: { uri: [m[1]], dn: user, password },
                search_branch: m[2],
            })
        }
    }
    throw "TODO " + url
}

const maxCount = <T extends string>(counted: MyMap<T, number>) => (
    maxBy(toPairs(counted), e => e[1])?.[0] as Option<T>
)

function simplify_sql_query(query: string) {
    return query
}

const from_raw_remote_query = (fullname2name: Dictionary<string>) => (group: MyMap<string, string>, groupName: string) => {
    const remote_cfg_name_ = group.LdapSourceId || group.DbName || throw_("no remote_cfg_name found for " + JSON.stringify(group))
    const periodicity = group.IntervalSeconds?.oMap(from_intervalSeconds) || (group.QuartzCron || group.LdapQuartzCron)?.oMap(from_quartzCron) || throw_("no periodicity found for " + JSON.stringify(group))
    const forced_periodicity = migration_conf.remap_periodicities[periodicity] ?? periodicity

    const sql_query = group.Query
    const full_remote_cfg_name = `${sql_query ? 'db' : 'ldap'}_${remote_cfg_name_}`
    const remote_cfg_name = fullname2name[full_remote_cfg_name]
    if (!remote_cfg_name) {
        console.error(`SKIPPING ${groupName}: unknown remote "${remote_cfg_name_}"`)
        return undefined
    }

    if (sql_query) {
        const select_query = simplify_sql_query(sql_query)
        const ssdn = toDn("ou=people,dc=univ-paris1,dc=fr")
        return is<RemoteSqlQuery>({
            remote_cfg_name, forced_periodicity,
            /** query which returns either a DN or a string to transform into DN using ToSubjectSource */
            select_query, 
            /** how to transform values into a DN */
            to_subject_source: { ssdn },
        })
    } else {
        let filter = group.LdapFilter
        return is<RemoteLdapQuery>({
            remote_cfg_name, forced_periodicity,
            filter,
        })
    }
}

function get_periodicities(remote_queries: Partial<Record<string, RemoteQuery>>) {
    return mapValues(groupBy(hMyMap.values(remote_queries), 'remote_cfg_name'), grouped => {
        const used_periodicities: MyMap<Periodicity, number> = countBy(grouped.map(group => group.forced_periodicity));
        const weird_periodicities = hMyMap.filter(used_periodicities, (_, periodicity) => (
            !conf.additional_periodicities.includes(periodicity))
        );
        const default_periodicity = maxCount(weird_periodicities) || maxCount(used_periodicities);
        if (default_periodicity) {
            delete weird_periodicities[default_periodicity];
        }
        if (!isEmpty(weird_periodicities)) {
            console.log("missing conf.additional_periodicities", weird_periodicities, `(or maybe "${default_periodicity}")`);
        }
        return default_periodicity;
    });
}

function remove_unneeded_forced_periodicites(remote_queries: Partial<Record<string, RemoteQuery>>, periodicities: MyMap<string, Periodicity>) {
    hMyMap.each(remote_queries, rq => {
        if (rq.forced_periodicity === periodicities[rq.remote_cfg_name]) {
            delete rq.forced_periodicity
        }
    })    
}

async function parse_grouper_ldap_sources(sources_xml_file: string) {
    const xml = await xml2js.parseStringPromise(readFileSync(sources_xml_file))

    const sources: Dictionary<Dictionary<string>> = fromPairs(xml.sources.source.filter((e: any) => (
        e['$'].adapterClass === 'edu.internet2.middleware.grouper.subj.GrouperJndiSourceAdapter'
    )).map((e: any) => [ 
        e.id[0], {
            ...fromPairs(
                e['init-param'].map((e: any) => [ e['param-name'][0], e['param-value'][0] ])
            ),
            search_branch: fromPairs(e.search?.[0]?.param?.map((e: any) => [ e['param-name'][0], e['param-value'][0] ]))?.base,
        }
    ]))
    return mapValues(pickBy(sources, source => source.PROVIDER_URL), source => is<RemoteLdapConfig>({
        driver: 'ldap',
        connect: {
            uri: source.PROVIDER_URL.split(" "),
            dn: source.SECURITY_PRINCIPAL,
            password: source.SECURITY_CREDENTIALS,
        },
        search_branch: source.search_branch.trim()
    }))
}


export default async function (sources_xml_file: string, grouper_loader_properties_file: string) {
    // some grouper-loader groups use sources from sources.xml
    const grouper_sources = await parse_grouper_ldap_sources(sources_xml_file)

    const { remote_configs, fullname2name } = get_grouper_loader_properties(grouper_loader_properties_file, grouper_sources)
    //console.log(Object.keys(remote_configs).join(" "))

    const raw_remote_queries = await get_grouper_loader_groups()    
    const remote_queries = hMyMap.compact(hMyMap.mapValues(raw_remote_queries, from_raw_remote_query(fullname2name)))
    const periodicities = get_periodicities(remote_queries)
    remove_unneeded_forced_periodicites(remote_queries, periodicities)

    const remote_configs_ = hMyMap.mapValues(remote_configs, add_periodicity(periodicities))

    process.stdout.write(`import { is } from "./helpers";
import { Config } from "./my_types";
    
export default is<Config['remotes']>(${JSON.stringify(remote_configs_, undefined, '  ')})
`)
    // force conf.remotes for api_post.modify_remote_query
    conf.remotes = remote_configs_
    //console.log(remote_queries)
    await hMyMap.eachAsync(remote_queries, async (rq, id_) => {
        const id = to_id(id_)
        try {
            await ensure_sgroup_object_classes(id)
        } catch (err) {
            console.error(err)
        }
        console.warn("setting", id, rq)
        await api_post.modify_remote_query_(id, rq)
    })
}
