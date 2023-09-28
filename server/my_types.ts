import _ from 'lodash'
import { SessionOptions } from 'express-session';
import { Options as SessionFileStoreOptions } from 'session-file-store';
import { Periodicity } from './periodicity';


export type Option<T> = T | undefined

export const hOption = {
    isSome : <T>(v: Option<T>) => (
        v !== undefined && v !== null
    ),
    isGT : <T>(v1: Option<T>, v2: Option<T>) => (
        v1 !== undefined && v1 !== null && (
            v2 === undefined || v2 === null || v1 > v2
        )
    ),
}

export type MyMap<K extends string, V> = Partial<Record<K, V>>

export const hMyMap = {
    each: <K extends string, V>(map: MyMap<K, V>, cb: (v:V, k:K) => void) => {
        for (const k in map) cb(map[k] as V, k)
    },
    eachAsync: async <K extends string, V>(map: MyMap<K, V>, cb : (v:V, k:K) => Promise<void>) => {
        for (const k in map) await cb(map[k] as V, k)
    },
    mapToArray: <K extends string, V, R>(map: MyMap<K, V>, cb: (v:V, k:K) => R) => {
        const r: R[] = []
        for (const k in map) {
            r.push(cb(map[k] as V, k))
        }
        return r
    },
    mapValues: <K extends string, V, V_>(map: MyMap<K, V>, cb: (v:V, k:K) => V_) => (
        _.mapValues(map, cb) as MyMap<K,V_>
    ),
    filter: <K extends string, V>(map: MyMap<K, V>, cb: (v:V, k:K) => boolean) => (
        // @ts-expect-error
        _.pickBy(map, cb) as MyMap<K,V>
    ),
    /*filter_map: <K extends string, K_ extends string, V, V_>(map: MyMap<K, V>, cb: (v:V, k:K) => [K_,V_]) => {
        let r: MyMap<K_,V_> = {}
        for (const k in map) {
            cb(map[k], k)?.oMap(([k_, v_]) => r[k_] = v_)
        }
        return r
    },*/
    fromPairs: <K extends string, V>(pairs: [K,V][]) => {
        let r: MyMap<K,V> = {}
        for (const [k,v] of pairs) r[k] = v
        return r
    },
    // same as _.fromPairs(_.compact(...)), but more perfomant
    fromOptionPairs: <K extends string, V>(pairs: Option<[K,V]>[]) => {
        const r: MyMap<K,V> = {}
        for (const pair of pairs) {
            if (pair) r[pair[0]] = pair[1]
        }
        return r
    },
    firstEntry: <K extends string, V>(map: MyMap<K, V>) => (
        Object.entries(map)?.[0] as Option<[K,V]>
    ),
    firstValue: <K extends string, V>(map: MyMap<K, V>) => (
        Object.values(map)?.[0] as Option<V>
    ),
    compact: <K extends string, V>(map: MyMap<K,Option<V>>) => (
        _.pickBy(map, hOption.isSome) as MyMap<K,V>
    ),
    length: (map: MyMap<any, unknown>) => (
        _.size(map)
    ),
    keys: <K extends string, V>(map: MyMap<K, V>) => (
        Object.keys(map) as K[]
    ),
    values: <K extends string, V>(map: MyMap<K, V>) => (
        Object.values(map) as V[]
    ),
}


export type MySet<T> = T[]

export const default_separator = "."
export const default_root_id = ""

export const ldap_config_checker = (cfg : LdapConfig) => {   
    if (!sgroup_sscfg_raw(cfg)) {
        throw "expected ''ldap.groups_dn'' to be listed in ''ldap.subject_sources''"
    }
}

export interface StemConfig {
    filter: string,
    separator?: string,
    root_id?: string,
}

export interface SubjectSourceConfig {
    dn : FlavorDn,
    name : string,
    /** default template is "display first non empty `display_attrs` value" */
    vue_template ?: string,
    vue_template_if_ambiguous ?: string,    
    display_attrs : string[],
    id_attrs ?: string[],

    search_filter : string,
}

interface SgroupAttrTexts {
    label: string,
    description?: string,
    only_in_stem?: string,   
    vue_template?: string,    
    input_attrs?: MyMap<string, string>
}

export interface LdapConfig {
    connect: { uri: string[], dn: FlavorDn, password: string, verbose?: boolean },
    base_dn: FlavorDn,
    /** DN of the branch containing groups&stems groupald is working on. More info comes from the corresponding subject_source */
    groups_dn: FlavorDn,
    stem_object_classes: MySet<string>,
    group_object_classes: MySet<string>,
    sgroup_filter?: string, // needed if groupad does not own all groups in groups_dn
    group_filter: string,
    stem: StemConfig,
    subject_sources: SubjectSourceConfig[],
    groups_flattened_attr: MyMap<Mright, string>,
    sgroup_attrs: MyMap<string, SgroupAttrTexts>,
}
export interface LdapConfigOut {
    groups_dn: Dn,
    subject_sources: SubjectSourceConfig[],
    sgroup_attrs: MyMap<string, SgroupAttrTexts>,
}

const sgroup_sscfg_raw = (self: LdapConfig) => (
    self.subject_sources.find(sscfg => sscfg.dn === self.groups_dn)
)
export const hLdapConfig = {
    /** returns the ldap.subject_sources entry for the groups&stems groupald is working on */
    sgroup_sscfg: (self: LdapConfig) => {
        const sscfg = sgroup_sscfg_raw(self)
        if (!sscfg) {
            throw "internal error (should be checked as startup)"
        }
        return sscfg
    },
    /** export LdapConfig to the Vue.js UI */
    to_js_ui: (self: LdapConfig): LdapConfigOut => (
        { groups_dn: toDn(self.groups_dn), subject_sources: self.subject_sources, sgroup_attrs: self.sgroup_attrs }
    ),
}

/** known remote drivers */
export const remoteSqlDrivers = [ 'mysql', 'oracle', 'postgresql' ] as const
export type RemoteSqlDriver = (typeof remoteSqlDrivers)[number]

export interface RemoteSqlConfig {
    driver: RemoteSqlDriver,

    host: string,
    port?: number, // u16
    user: string,
    password: string,
    
    db_name: string,
}
export interface RemoteLdapConfig {
    driver: 'ldap'
    connect: LdapConfig['connect']
    search_branch?: FlavorDn
}
export type RemoteConfig = {
    periodicity: Periodicity
} & (RemoteLdapConfig | RemoteSqlConfig)

/** helpers to work on RemoteConfig */
export const hRemoteConfig = {
    export: (self: RemoteConfig) => (
        _.omit(self, ['user', 'password', 'connect.user', 'connect.password'])
    ),
}

export interface Config {
    trusted_auth_bearer?: string,
    log_dir?: string,
    cas: { prefix_url: string },
    trust_proxy?: string,
    session_store: {
        options: SessionOptions,
        file_store: SessionFileStoreOptions,
    },
    //#[serde(deserialize_with = "ldap_config_checker")] 
    ldap: LdapConfig,
    remotes: MyMap<string, RemoteConfig>,
    additional_periodicities: Periodicity[]
    remote_forced_periodicity_attr: string
}

/** member or right */
export type Mright = 'member' | Right
export type Right = 'reader' | 'updater' | 'admin'

export const hMright = {
    to_attr: (self: Mright) => (
        `memberURL;x-${self}`
    ),
    attr_synchronized: `memberURL;x-member-remote`,
    list: (): Mright[] => (
        [ 'member', 'reader', 'updater', 'admin' ]
    ),
}

/** NB: best rights first */
const to_allowed_rights = (self: Right): Right[] => {
    switch (self) {
        case 'reader': return ['admin', 'updater', 'reader']
        case 'updater': return ['admin', 'updater']
        case 'admin': return ['admin']
    }
}

/** helpers to work on rights */
export const hRight = {
    to_allowed_rights,
    // NB: best right first
    to_allowed_attrs: (self: Right): string[] => (
        to_allowed_rights(self).map(hMright.to_attr)
    ),
    to_attr: hMright.to_attr,
    max: (a: Option<Right>, b: Option<Right>) => {
        if (a === 'admin' || b === 'admin') return 'admin'
        if (a === 'updater' || b === 'updater') return 'updater'
        if (a === 'reader' || b === 'reader') return 'reader'
        return undefined
    },
    max_: (l: Right[]) => {
        let r: Option<Right>
        for (const a of l) {
            r = hRight.max(r, a)
        }
        return r
    },
    list: (): Right[] => (
        [ 'reader', 'updater', 'admin' ]
    ),
}

// same as ldapjs.Change "operation"
export type MyMod = 'add' | 'delete' | 'replace'

// https://stackoverflow.com/questions/56737033/how-to-define-an-opaque-type-in-typescript
export type FlavorDn = string & { _type?: "Dn" }
export type Dn = string & { _type: "Dn" } // fake field to enforce types: you can't convert to "Dn" without casting
export const toDns = (dns: string[]) => dns as Dn[]
export const toDn = (dn: string) => dn as Dn

/** members or rights to add/remove/replace (with optional member options) */
export type MyMods = MyMap<Mright, MyMap<MyMod, DnsOpts>>

export type MonoAttrs = MyMap<string, string>;
export type MultiAttrs = MyMap<string, string[]>;

export type SgroupsWithAttrs = MyMap<string, MonoAttrs>;

export interface DirectOptions {
    enddate?: string,
}

export type DnsOpts = MyMap<Dn, DirectOptions>;

export interface SubjectAttrs {
    attrs: MonoAttrs,
    sgroup_id?: string,
    options: DirectOptions,
}

export type Subjects = MyMap<Dn, SubjectAttrs>;

export type SubjectsOrNull = MyMap<Dn, SubjectAttrs | null>;

export interface SubjectsAndCount {
    count: number, // interger
    subjects: SubjectsOrNull,
}

/** group/stem id & attributes + loggedUser right on this group/stem */
export interface SgroupOutAndRight {
    attrs: MonoAttrs,

    sgroup_id: string,
    right?: Right,
}

/** stem children or group direct_members or sync group definition */
export type SgroupOutMore = 
    { stem: { children: SgroupsWithAttrs } } |
    { group: { direct_members: SubjectsOrNull } } |
    { synchronizedGroup: { remote_query: RemoteQuery, last_sync_date: Option<Date> } }

/** group/stem attributes + parents + loggedUser right on this group/stem + stem children or group direct_members or sync group definition */
export type SgroupAndMoreOut = SgroupOutMore & {
    attrs: MonoAttrs,
    parents: SgroupOutAndRight[],
    right: Right,
}

export type LoggedUser = { TrustedAdmin: true } | { User: string }
/** LoggerUser helpers */
export const hLoggedUser = {
    toString: (self: LoggedUser) => (
        'User' in self ? self.User : "TrustedAdmin"
    ),
}
export type LoggedUserDn = { TrustedAdmin: true } | { User: Dn }

/** to transform values returned by SELECT query into DN */
export interface ToSubjectSource {
    /** branch DN to search (eg: ou=people,...). If must be listed in conf.ldap.subject_sources */
    ssdn: Dn,
    /** attribute to use to find values. If not given, all sscfg.id_attrs will be searched */
    id_attr?: string,
}

export interface RemoteLdapQuery {
    /** empty string means the LDAP server used for groups&subjects */
    remote_cfg_name: string
    forced_periodicity?: Periodicity
    /** LDAP branch to search (defaults to conf.ldap.base_dn if remote_cfg_name is "") */
    DN?: string
    /** LDAP filter on the branch */
    filter?: string
    /** usually unset (since the DNs matching the branch & filter are directly used). Useful examples: "member", "seeAlso"... */
    attribute?: string
}
export interface RemoteSqlQuery {
    remote_cfg_name: string, 
    forced_periodicity?: Periodicity
    /** query which returns either a DN or a string to transform into DN using ToSubjectSource */
    select_query: string, 
    /** how to transform values into a DN */
    to_subject_source?: ToSubjectSource,
}
export type RemoteQuery = RemoteLdapQuery | RemoteSqlQuery
export const isRqSql = (rq: Option<RemoteQuery>): rq is RemoteSqlQuery => (
    rq ? "select_query" in rq : false
)
export const toRqSql = (rq: Option<RemoteQuery>) => (
    isRqSql(rq) ? rq : undefined
)

export interface TestRemoteQuery {
    count: number,
    values: string[],
    values_truncated: boolean,
    ss_guess: Option<[ToSubjectSource, Subjects]>,
}

export type SgroupLog = { who: string, when: Date, action: string } & Record<string, any>

export interface SgroupLogs { 
    last_log_date: Option<Date>
    whole_file: boolean
    logs: SgroupLog[]
}
