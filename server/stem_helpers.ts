import conf from "./conf"
import { may_strip_suffix, strip_prefix } from "./helpers"
import { default_root_id, default_separator } from "./my_types"

// ("a.b.c", ".") => "a.b."
// ("a", ".") => undefined
const rbefore = (s: string, end: string) => {
    const i = s.lastIndexOf(end)
    return i >= 0 ? s.substring(0, i + end.length) : undefined
}


export const stem_separator = () => conf.ldap.stem.separator ?? default_separator
export const root_id = () => conf.ldap.stem.root_id ?? default_root_id
// "a.b.c." => "a.b."
// "a.b.c" => "a.b."
// "a." => ""
// "a" => ""
// "" => undefined
export function parent_stem(id: string) {
    if (id === root_id()) { 
        return undefined
    } else {
        id = may_strip_suffix(id, stem_separator())
        const r = rbefore(id, stem_separator())
        return r !== undefined ? r : root_id()
    }
}

// "a.b.c" => ["a.b.", "a.", ""]
export function parent_stems(id: string) {
    const stems : string[] = [];
    for (;;) {
        const parent = parent_stem(id)
        if (parent === undefined) break;
        id = parent;
        stems.push(parent);
    }
    return stems
}
export function validate_sgroup_id(id: string) {
    if (id !== root_id()) {
        id = may_strip_suffix(id, stem_separator())
        for (const one of id.split(stem_separator())) {
            if (one === '' || one.match(/[^\w_-]/)) {
                throw "invalid sgroup id"
            }
        }
    }
}

export const is_stem = (id: string) => (
    id === root_id() || id.endsWith('.')
)

export function is_grandchild(parent: string, gchild: string) {
    let sub = strip_prefix(gchild, parent)
    if (sub !== undefined) {
        sub = may_strip_suffix(sub, stem_separator())
        return sub.includes(stem_separator())
    } else {
        // weird? should panic?
        return false
    }
}
