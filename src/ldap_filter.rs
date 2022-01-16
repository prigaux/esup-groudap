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

pub fn _not(filter: &str) -> String {
    format!("(!{})", filter)
}

pub fn and2(filter1: &str, filter2: &str) -> String {
    format!("(&{}{})", filter1, filter2)
}

pub fn or(l : Vec<String>) -> String {
    match &l[..] {
        [filter] => filter.to_owned(),
        _ => format!("(|{})", l.concat()),
    }
}

pub fn rdn(rdn: &str) -> String {
    format!("({})", rdn)
}

pub fn member(dn: &str) -> String {
    eq("member", dn)
}

pub fn sgroup_self_and_children(id: &str) -> String {
    let id = ldap_escape(id);
    format!("(cn={}*)", &id)
}

pub fn sgroup_children(id: &str) -> String {
    if id.is_empty() {
        "(cn=*)".to_owned()
    } else {
        let id = ldap_escape(id);
        format!("(&(cn={}*)(!(cn={})))", &id, &id)
    }
}
