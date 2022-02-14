use std::fmt;

use ldap3::LdapError;

#[derive(Debug)]
pub enum MyErr {
    Msg(String),
    Ldap(LdapError),
    Io(std::io::Error),
    SerdeJson(serde_json::Error),
}

impl fmt::Display for MyErr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", match self {
            MyErr::Msg(err) => err.to_owned(),
            MyErr::Ldap(err) => err.to_string(),
            MyErr::Io(err) => err.to_string(),
            MyErr::SerdeJson(err) => err.to_string(),
        })
    }
}

impl From<LdapError> for MyErr {
    fn from(err: LdapError) -> Self {
        MyErr::Ldap(err)
    }
}
impl From<std::io::Error> for MyErr {
    fn from(err: std::io::Error) -> Self {
        MyErr::Io(err)
    }
}
impl From<serde_json::Error> for MyErr {
    fn from(err: serde_json::Error) -> Self {
        MyErr::SerdeJson(err)
    }
}

pub type Result<T> = std::result::Result<T, MyErr>;
