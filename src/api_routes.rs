use rocket::request::{self, FromRequest, Request};
use rocket::http::Status;
use rocket::http::{Cookie, CookieJar};

use rocket::outcome::{Outcome, try_outcome};
use rocket::serde::{json::Json};
use rocket::{Route, State};

use ldap3::{LdapResult};
use ldap3::result::Result;

use super::my_types::{Attrs, GroupKind, MyMods, Config, LoggedUser};
use super::api;
use super::ldap_wrapper;
use super::test_data;
use super::cas_auth;


#[rocket::async_trait]
impl<'r> FromRequest<'r> for LoggedUser {
    type Error = ();

    async fn from_request(request: &'r Request<'_>) -> request::Outcome<Self, ()> {
        let config = try_outcome!(request.guard::<&State<Config>>().await);
        let bearer = request.headers().get_one("Authorization")
                        .and_then(|auth| auth.strip_prefix("Bearer "));
        if bearer.is_some() && bearer == config.trusted_auth_bearer.as_deref() {
            return Outcome::Success(LoggedUser::TrustedAdmin);
        }
        if let Some(cookie) = request.cookies().get_private("user_id") {
            return Outcome::Success(LoggedUser::User(cookie.value().to_owned()));
        }
        Outcome::Failure((Status::Unauthorized, ()))
    }
}


fn to_json(r : Result<LdapResult>) -> Json<bool> {
    Json(match r {
        Err(err) => { dbg!(err); false }
        Ok(res) if res.rc != 0 => { dbg!(&res); false }
        Ok(_) => { true }
    })
}

fn to_json_<T>(r : std::result::Result<T, String>) -> Json<bool> {
    Json(match r {
        Err(err) => { dbg!(err); false }
        Ok(_) => { true }
    })
}


#[get("/login?<ticket>")]
async fn login(ticket: String, jar: &CookieJar<'_>, config: &State<Config>) -> Json<bool> {
    to_json_(async { 
        let service = "http://localhost"; // TODO
        let user = cas_auth::validate_ticket(&config.cas.prefix_url, service, &ticket).await?;
        jar.add_private(Cookie::new("user_id", user));
        Ok(())
    }.await)
}

#[get("/set_test_data")]
async fn set_test_data(config: &State<Config>, user: LoggedUser) -> Json<bool> {
    to_json(async { test_data::set(&mut ldap_wrapper::open(&config.ldap, &user).await?).await }.await)
}
#[get("/clear_test_data")]
async fn clear_test_data(config: &State<Config>, user: LoggedUser) -> Json<bool> {
    to_json(async { test_data::clear(&mut ldap_wrapper::open(&config.ldap, &user).await?).await }.await)
}
#[get("/add_test_data")]
async fn add_test_data(config: &State<Config>, user: LoggedUser) -> Json<bool> {
    to_json(async { test_data::add(&mut ldap_wrapper::open(&config.ldap, &user).await?).await }.await)
}

#[post("/create?<id>&<kind>", data = "<attrs>")]
async fn create(id: String, kind: Option<&str>, attrs: Json<Attrs>, config: &State<Config>, user: LoggedUser) -> Json<bool> {
    let kind = match kind { 
        Some("stem") => GroupKind::STEM,
        _ => GroupKind::GROUP
    };
    to_json(async {
        api::create(&mut ldap_wrapper::open(&config.ldap, &user).await?, kind, &id, attrs.into_inner()).await
    }.await)
}

#[post("/delete?<id>")]
async fn delete(id: String, config: &State<Config>, user: LoggedUser) -> Json<bool> {
    to_json(async {
        api::delete(&mut ldap_wrapper::open(&config.ldap, &user).await?, &id).await
    }.await)
}

// curl 'localhost:8000/modify_members_or_rights/?id=foo.bar' -d '{ "member": { "add": [ "ldap:///uid=prigaux2,..." ] } }'
#[post("/modify_members_or_rights?<id>", data = "<mods>")]
async fn modify_members_or_rights(id: String, mods: Json<MyMods>, config: &State<Config>, user: LoggedUser) -> Json<bool> {
    to_json(async {
        api::modify_members_or_rights(&mut ldap_wrapper::open(&config.ldap, &user).await?, &id, mods.into_inner()).await
    }.await)
}

pub fn routes() -> Vec<Route> {
    routes![
        login,
        clear_test_data, add_test_data, set_test_data, 
        create, delete, modify_members_or_rights,
    ]
}