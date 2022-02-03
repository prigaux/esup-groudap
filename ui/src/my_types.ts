export type PRecord<K extends keyof any, T> = {
    [P in K]?: T;
};

export type Right = 'reader' | 'updater' | 'admin'
export type Mright = 'member' | Right

export type MyMod = 'add' | 'delete' | 'replace'
export type MyMods = PRecord<Mright, PRecord<MyMod, string[]>>

export type MonoAttrs = Record<string, string>

export interface SubjectAttrs { 
    attrs: MonoAttrs
    sgroup_id?: string
}
export type SubjectAttrs_with_more = SubjectAttrs & { sscfg_dn?: string, indirect?: boolean, sort_field?: string }

export type SgroupsWithAttrs = Record<string, MonoAttrs>

export type Subjects = Record<string, SubjectAttrs>;
export type Subjects_with_more = Record<string, SubjectAttrs_with_more>;

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
    dn : string
    name : string
    vue_template? : string
    display_attrs : string[]
}

export interface LdapConfigOut {
    groups_dn: string
    subject_sources: SubjectSourceConfig[]
}

export type Ssdn = string
