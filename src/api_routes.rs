use rocket::serde::{json::Json};
use rocket::Route;

use ldap3::{Ldap, LdapConnAsync, LdapResult};
use ldap3::result::Result;

use super::my_types::{Attrs, GroupKind, MyMods};
use super::api;
use super::test_data;


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
    to_json(async { test_data::set(&mut open_ldap().await?).await }.await)
}
#[get("/clear_test_data")]
async fn clear_test_data() -> Json<bool> {
    to_json(async { test_data::clear(&mut open_ldap().await?).await }.await)
}
#[get("/add_test_data")]
async fn add_test_data() -> Json<bool> {
    to_json(async { test_data::add(&mut open_ldap().await?).await }.await)
}

#[post("/create?<id>&<kind>", data = "<attrs>")]
async fn create(id: String, kind: Option<&str>, attrs: Json<Attrs>) -> Json<bool> {
    let kind = match kind { 
        Some("stem") => GroupKind::STEM,
        _ => GroupKind::GROUP
    };
    to_json(async {
        api::create(&mut open_ldap().await?, kind, &id, attrs.into_inner()).await
    }.await)
}

#[post("/delete?<id>")]
async fn delete(id: String) -> Json<bool> {
    to_json(async {
        api::delete(&mut open_ldap().await?, &id).await
    }.await)
}

// curl 'localhost:8000/modify_members_or_rights/?id=foo.bar' -d '{ "member": { "add": [ "ldap:///uid=prigaux2,..." ] } }'
#[post("/modify_members_or_rights?<id>", data = "<mods>")]
async fn modify_members_or_rights(id: String, mods: Json<MyMods>) -> Json<bool> {
    to_json(async {
        api::modify_members_or_rights(&mut open_ldap().await?, &id, mods.into_inner()).await
    }.await)
}

pub fn routes() -> Vec<Route> {
    routes![
        clear_test_data, add_test_data, set_test_data, 
        create, delete, modify_members_or_rights,
    ]
}