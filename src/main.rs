use rocket::serde::{json::Json};

use ldap3::{Ldap, LdapConnAsync};
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
async fn close_ldap(mut ldap: Ldap) -> Result<()> {
    Ok(ldap.unbind().await?)
}


#[get("/add_test_data")]
async fn add_test_data() -> Json<bool> {
    if let Ok(mut ldap) = open_ldap().await {
        let r = match my_ldap::add_test_data(&mut ldap).await {
            Err(err) => { dbg!(err); Json(false) }
            _ => Json(true)
        };
        let _ = close_ldap(ldap).await;
        r
    } else { Json(false) }
}

#[post("/modify_members_or_rights?<id>", data = "<mods>")]
async fn modify_members_or_rights(id: String, mods: Json<my_ldap::MyMods>) -> Json<bool> {
    if let Ok(mut ldap) = open_ldap().await {
        let r = match my_ldap::modify_members_or_rights(&mut ldap, &id, mods.into_inner()).await {
            Err(err) => { dbg!(err); Json(false) }
            _ => Json(true)
        };
        let _ = close_ldap(ldap).await;
        r
    } else { Json(false) }
}


#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![add_test_data, modify_members_or_rights])
}
