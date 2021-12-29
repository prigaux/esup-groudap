use rocket::serde::{Serialize, json::Json};

#[derive(Serialize)]
struct Task {
    foo: String,
}

use ldap3::{LdapConnAsync, Scope, SearchEntry};
use ldap3::result::Result;
#[macro_use]
extern crate maplit;

#[macro_use] 
extern crate rocket;

async fn ldapStuff() -> Result<String> {
    let (conn, mut ldap) = LdapConnAsync::new("ldap://localhost").await?;
    ldap3::drive!(conn);
    let res = ldap.simple_bind("cn=admin,dc=nodomain", "a").await;
    println!("binding: {:?}", res);
    let _res = ldap.delete("uid=prigaux,ou=people,dc=nodomain").await;
    let _res = ldap.delete("ou=people,dc=nodomain").await;
    let _res = ldap.delete("dc=nodomain").await;

    let res = ldap.add("dc=nodomain", vec![
        ("objectClass", hashset!{"dcObject", "organization"}),
        ("dc", hashset!{"nodomain"}),
        ("o", hashset!{"nodomain"}),
    ]).await;
    println!("adding root: {:?}", res);
    let res = ldap.add("ou=people,dc=nodomain", vec![
        ("objectClass", hashset!{"organizationalUnit"}),
        ("ou", hashset!{"people"}),
    ]).await;
    println!("adding ou=people: {:?}", res);
    let res = ldap.add("uid=prigaux,ou=people,dc=nodomain", vec![
        ("objectClass", hashset!{"inetOrgPerson", "shadowAccount"}),
        ("uid", hashset!{"prigaux"}),
        ("cn", hashset!{"Rigaux Pascal"}),
        ("displayName", hashset!{"Pascal Rigaux"}),
        ("sn", hashset!{"Rigaux"}),
    ]).await;
    println!("adding a user: {:?}", res);

    let (rs, _res) = ldap.search("dc=nodomain", Scope::Subtree, "(objectClass=person)", vec!["displayName"]).await?.success()?;
    let mut z = "<unknown>".to_string();
    for entry in rs {
        z = SearchEntry::construct(entry).dn
    }
    ldap.unbind().await?;
    Ok(z)
}


#[get("/?<foo>")]
async fn index(foo: Option<String>) -> Json<Task> {
    //let foo = format!("Hello {}", foo.unwrap_or("????".to_string()));
    let foo = ldapStuff().await.unwrap_or("???".to_string());
    let task = Task { foo };
    Json(task)
}

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![index])
}
