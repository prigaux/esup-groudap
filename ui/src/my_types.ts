export type PRecord<K extends keyof any, T> = {
    [P in K]?: T;
};

export type Dn = string

export type Right = 'reader' | 'updater' | 'admin'
export type Mright = 'member' | Right

export type MyMod = 'add' | 'delete' | 'replace'
export type MyMods = PRecord<Mright, PRecord<MyMod, string[]>>

export type MonoAttrs = Record<string, string>

export interface SubjectAttrs { 
    attrs: MonoAttrs
    sgroup_id?: string
    enddate?: Date

}
export type SubjectAttrs_with_more = SubjectAttrs & { sscfg_dn?: Dn, indirect?: boolean, sort_field?: string }

export type SgroupsWithAttrs = Record<string, MonoAttrs>

export type Subjects = Record<Dn, SubjectAttrs>;
export type Subjects_with_more = Record<Dn, SubjectAttrs_with_more>;

export interface SgroupOutAndRight {
    attrs: MonoAttrs
    sgroup_id: string
    right?: Right
}

export interface ToSubjectSource {
    ssdn: Dn
    id_attr: string
}

export interface RemoteConfig {
    host: string,
    port?: number,
    driver: string,
    db_name: string,
    periodicity: string,
}

export interface RemoteSqlQuery {
    remote_cfg_name: string
    select_query: string // query returns either a DN or a string to transform into DN using ToSubjectSource
    to_subject_source: ToSubjectSource
}

export interface SgroupOutMore {
    stem?: { children: SgroupsWithAttrs }
    group?: { direct_members: Subjects }
    synchronizedGroup?: { remote_sql_query: RemoteSqlQuery }

    // internal
    synchronized_group_orig?: { remote_sql_query: RemoteSqlQuery }
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
    name : string
    vue_template? : string
    display_attrs : string[]
    id_attrs?: string[]
}

export interface LdapConfigOut {
    groups_dn: Dn
    subject_sources: SubjectSourceConfig[]
}

export type SgroupLog = { who: string, when: Date, action: string } & Record<string, string>
