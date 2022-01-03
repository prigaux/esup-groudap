use ldap3::{ldap_escape};

pub fn true_() -> &'static str {
    "(objectClass=*)"
}

pub fn stem() -> &'static str {
    "(objectClass=groupOfNames)"
}

pub fn eq(attr: &str, val: &str) -> String {
    format!("({}={})", attr, ldap_escape(val))
}

pub fn or(l : Vec<String>) -> String {
    match &l[..] {
        [filter] => filter.to_owned(),
        _ => format!("(|{})", l.concat()),
    }
}

pub fn member(dn: &str) -> String {
    format!("(member={})", dn)
}

pub fn sgroup_children(id: &str) -> String {
    format!("(cn={}.*)", ldap_escape(id))
}

