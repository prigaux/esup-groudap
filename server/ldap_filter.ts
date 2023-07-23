import { escape } from 'ldapjs/lib/filters/escape';
import { Dn, Option } from './my_types';

const and = (filters: string[]) => {
    // simplify empty AND/OR which are not handled by ldapjs.parseFilter
    const l = filters.filter(e => e !== '(&)')
    return l.length === 1 ? l[0] : l.includes('(|)') ? '(|)' : "(&" + l.join('') + ")"
}

const or = (filters : string[]) => {
    // simplify empty AND/OR which are not handled by ldapjs.parseFilter
    const l = filters.filter(e => e !== '(|)')
    return l.length === 1 ? l[0] : l.includes('(&)') ? '(&)' : "(|" + l.join('') + ")"
}

const eq = (attr: string, val: string) => (
    `(${attr}=${escape(val)})`
)

export default {
    or,
    and,
    eq,

    true_: () => (
        "(objectClass=*)"
    ),

    presence: (attr: string) => (
        `(${attr}=*)`
    ),

        
    not: (filter: string) => (
        `(!${filter})`
    ),
            
    and2: (filter1: string, filter2: string) => (
        and([filter1, filter2])
    ),
    and2_if_some: (filter1: string, filter2: Option<string>) => (
        filter2 ? and([filter1, filter2]) : filter1
    ),

    rdn: (rdn: string) => (
        `(${rdn})`
    ),

    member: (dn: Dn) => (
        eq("member", dn)
    ),

    sgroup_self_and_children: (id: string) => (
        `(cn=${escape(id)}*)`
    ),

    sgroup_children: (id: string) => {
        if (id === '') {
            return "(cn=*)"
        } else {
            id = escape(id);
            return `(&(cn=${id}*)(!(cn=${id})))`
        }
    },

}