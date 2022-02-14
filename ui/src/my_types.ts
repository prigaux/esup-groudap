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

export interface SgroupOutMore {
    stem?: { children: SgroupsWithAttrs }
    group?: { direct_members: Subjects }
}

export type SgroupAndMoreOut = SgroupOutMore & {
    attrs: MonoAttrs
    parents: SgroupOutAndRight[]
    right: Right
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
}

export interface LdapConfigOut {
    groups_dn: Dn
    subject_sources: SubjectSourceConfig[]
}

export type SgroupLog = { who: string, when: Date, action: string } & Record<string, string>
