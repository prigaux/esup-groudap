use ldap3::{ldap_escape};

pub fn true_() -> &'static str {
    "(objectClass=*)"
}

/*pub fn group() -> &'static str {
    "(objectClass=groupOfNames)"
}*/

pub fn eq(attr: &str, val: &str) -> String {
    format!("({}={})", attr, ldap_escape(val))
}

pub fn _or(l : Vec<String>) -> String {
    match &l[..] {
        [filter] => filter.to_owned(),
        _ => format!("(|{})", l.concat()),
    }
}

pub fn member(dn: &str) -> String {
    eq("member", dn)
}

pub fn sgroup_children(id: &str) -> String {
    format!("(cn={}.*)", ldap_escape(id))
}
