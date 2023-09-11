export type PRecord<K extends keyof any, T> = {
    [P in K]?: T;
};
export type Option<T> = T | undefined

export type Dn = string

export type Right = 'reader' | 'updater' | 'admin'
export type Mright = 'member' | Right

export interface DirectOptions {
    enddate?: string
}
export type DnsOpts = Record<Dn, DirectOptions>;

export type MyMod = 'add' | 'delete' | 'replace'
export type MyMods = PRecord<Mright, PRecord<MyMod, DnsOpts>>

export type MonoAttrs = Record<string, string>

export interface SubjectAttrs { 
    attrs: MonoAttrs
    sgroup_id?: string
    options?: DirectOptions

}
export type SubjectAttrs_with_more = SubjectAttrs & { sscfg_dn?: Dn, indirect?: boolean, sort_field?: string }

export type SgroupsWithAttrs = Record<string, MonoAttrs>

export type Subjects = Record<Dn, SubjectAttrs>;
export type SubjectsOrNull = Record<Dn, SubjectAttrs | null>;
export type Subjects_with_more = Record<Dn, SubjectAttrs_with_more | null>;

export interface SgroupOutAndRight {
    attrs: MonoAttrs
    sgroup_id: string
    right?: Right
}

export interface ToSubjectSource {
    ssdn: Dn
    id_attr: string
}

export interface SgroupAttrTexts {
    label: string
    description?: string
    only_in_stem?: string
    vue_template?: string
    input_attrs?: Record<string, string>
}

export interface RemoteSqlConfig {
    host: string,
    port?: number,
    driver: 'mysql' | 'oracle',
    db_name: string,
    periodicity: string,
}
export interface RemoteLdapConfig {
    driver: 'ldap',
    periodicity: string,

    connect: { uri: string[] }
    search_branch?: Dn
}
export type RemoteConfig = RemoteLdapConfig | RemoteSqlConfig

export interface RemoteSqlQuery {
    select_query: string // query returns either a DN or a string to transform into DN using ToSubjectSource
    to_subject_source: ToSubjectSource
}
export interface RemoteLdapQuery {
    DN?: string
    filter: string
    attribute?: string
}
export type RemoteQuery = { 
    isSql: Option<boolean>
    remote_cfg_name: string
    forced_periodicity?: string
    periodicity: string
} & RemoteSqlQuery & RemoteLdapQuery

export interface SgroupOutMore {
    stem?: { children: SgroupsWithAttrs }
    group?: { direct_members: Subjects }
    synchronizedGroup?: { remote_query: RemoteQuery, last_sync_date: Option<Date> }

    // internal
    synchronized_group_orig?: { remote_query: RemoteQuery }
}

export type SgroupAndMoreOut = SgroupOutMore & {
    attrs: MonoAttrs
    parents: SgroupOutAndRight[]
    right: Right
}
export type SgroupAndMoreOut_ = SgroupAndMoreOut & { 
    id: string
}

export interface SubjectsAndCount {
    count: number
    subjects: Subjects
}

export interface SubjectsAndCount_with_more {
    count: number
    subjects: Subjects_with_more
}


export interface SubjectSourceConfig {
    dn : Dn
    /** displayed in search subject results + displayed to choose subject for SQL remotes queries */
    name : string
    /** Vue.js template using "attrs.xxx" values (where "xxx" is an attribute name which must be listed in "display_attrs" below) */
    vue_template? : string
    /** attributes used in vue_template.  */
    display_attrs : string[]
    /** attributes which can be used to identify a user. Used to guess "to_subject_source" of remote SQL query results */
    id_attrs?: string[]
}

export interface LdapConfigOut {
    groups_dn: Dn
    subject_sources: SubjectSourceConfig[]
    sgroup_attrs: Record<string, SgroupAttrTexts>
}

export type SgroupLog = { who: string, when: Date, action: string } & Record<string, string>
