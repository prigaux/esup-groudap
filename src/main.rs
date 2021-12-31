use rocket::serde::{json::Json};

use ldap3::{Ldap, LdapConnAsync, LdapResult};
use ldap3::result::Result;
#[macro_use]
extern crate maplit;

#[macro_use] 
extern crate rocket;

mod my_ldap;

async fn open_ldap() -> Result<Ldap> {
    let (conn, mut ldap) = LdapConnAsync::new("ldap://localhost").await?;
    ldap3::drive!(conn);
    ldap.simple_bind("cn=admin,dc=nodomain", "a").await?;
    Ok(ldap)
}

fn to_json(r : Result<LdapResult>) -> Json<bool> {
    Json(match r {
        Err(err) => { dbg!(err); false }
        Ok(res) if res.rc != 0 => { dbg!(&res); false }
        Ok(_) => { true }
    })
}

#[get("/set_test_data")]
async fn set_test_data() -> Json<bool> {
    to_json(async {
        my_ldap::set_test_data(&mut open_ldap().await?).await
    }.await)
}

// curl 'localhost:8000/modify_members_or_rights/?id=foo' -d '{ "member": { "ADD": [ "ldap:///uid=prigaux2,..." ] } }'
#[post("/modify_members_or_rights?<id>", data = "<mods>")]
async fn modify_members_or_rights(id: String, mods: Json<my_ldap::MyMods>) -> Json<bool> {
    to_json(async {
        my_ldap::modify_members_or_rights(&mut open_ldap().await?, &id, mods.into_inner()).await
    }.await)
}


#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![set_test_data, modify_members_or_rights])
}
