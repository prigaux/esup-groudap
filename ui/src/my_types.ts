export type PRecord<K extends keyof any, T> = {
    [P in K]?: T;
};


export type Right = 'reader' | 'updater' | 'admin'
export type Mright = 'member' | Right

export type MyMod = 'add' | 'delete' | 'replace'
export type MyMods = PRecord<Mright, PRecord<MyMod, string[]>>

export type MonoAttrs = Record<string, string>

export type SubjectAttrs = MonoAttrs & { sgroup_id?: string }
export type SubjectAttrs_with_indirect = SubjectAttrs & { indirect?: boolean }

export type SgroupsWithAttrs = Record<string, MonoAttrs>

export type Subjects = Record<string, SubjectAttrs>;
export type Subjects_with_indirect = Record<string, SubjectAttrs_with_indirect>;

export type SgroupOutAndRight = MonoAttrs & {
    sgroup_id: string
    right?: Right
}

export interface SgroupOutMore {
    stem?: { children: SgroupsWithAttrs }
    group?: { direct_members: Subjects }
}

export type SgroupAndMoreOut = MonoAttrs & SgroupOutMore & {
    parents: SgroupOutAndRight[]
    right: Right
}

export interface SubjectsAndCount {
    count: number
    subjects: Subjects
}

export interface SubjectsAndCount_with_indirect {
    count?: number
    subjects: Subjects_with_indirect
}


export interface SubjectSourceConfig {
    dn : string
    name : string
    vue_template? : string
    vue_template_if_ambiguous? : string
    display_attrs : string[]
}
