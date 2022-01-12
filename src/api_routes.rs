use std::collections::BTreeMap;
use std::result::Result;

use rocket::request::{self, FromRequest, Request};
use rocket::http::{Status, ContentType};
use rocket::http::{Cookie, CookieJar};
use rocket::response::{self, Responder, Response};
use rocket::serde::json::json;

use rocket::outcome::{Outcome, try_outcome};
use rocket::serde::{json::Json};
use rocket::{Route, State};

use ldap3::result::LdapError;

use crate::my_types::{MonoAttrs, MyMods, Config, CfgAndLU, LoggedUser, SgroupAndMoreOut, RemoteConfig, SubjectSourceConfig, Right, Subjects, Mright, SgroupsWithAttrs};
use crate::api;
use crate::test_data;
use crate::cas_auth;


#[rocket::async_trait]
impl<'r> FromRequest<'r> for CfgAndLU<'r> {
    type Error = ();

    async fn from_request(request: &'r Request<'_>) -> request::Outcome<Self, ()> {
        let cfg = try_outcome!(request.guard::<&State<Config>>().await);
        let bearer = request.headers().get_one("Authorization")
                        .and_then(|auth| auth.strip_prefix("Bearer "));
        if bearer.is_some() && bearer == cfg.trusted_auth_bearer.as_deref() {
            let user = match request.headers().get_one("X-Impersonate-User") {
                Some(u) => LoggedUser::User(u.to_owned()),
                _ => LoggedUser::TrustedAdmin,
            };
            return Outcome::Success(CfgAndLU { cfg, user });
        }
        if let Some(cookie) = request.cookies().get_private("user_id") {
            return Outcome::Success(CfgAndLU { cfg, user: LoggedUser::User(cookie.value().to_owned()) });
        }
        Outcome::Failure((Status::Unauthorized, ()))
    }
}

struct MyJson { status: Status, body: String }

impl MyJson {
    fn new(status: Status, body: String) -> Self {
        Self { status, body }
    }
}

impl<'r, 'o: 'r> Responder<'r, 'o> for MyJson {
    fn respond_to(self, _: &'r Request<'_>) -> response::Result<'o> {
        Response::build()
            .status(self.status)
            .header(ContentType::JSON)
            .sized_body(self.body.len(), std::io::Cursor::new(self.body))
            .ok()
    }
}

fn err_to_json(err: impl ToString + std::fmt::Debug) -> MyJson {
    dbg!(&err); 
    let body = json!({
        "error": true,
        "msg": err.to_string(),
    });
    MyJson::new(Status::InternalServerError, body.to_string())
}

fn to_json<T>(r: Result<T, LdapError>) -> Result<Json<T>, MyJson> {
    r.map(Json).map_err(err_to_json)
}

fn action_result(r : Result<(), LdapError>) -> MyJson {
    match r {
        Err(err) => err_to_json(err),
        Ok(_) => {
            let body = json!({ "ok": true });
            MyJson::new(Status::Ok, body.to_string())
        },
    }
}

#[get("/login?<ticket>")]
async fn login(ticket: String, jar: &CookieJar<'_>, config: &State<Config>) -> Result<(), String> {
    let service = "http://localhost"; // TODO
    let user = cas_auth::validate_ticket(&config.cas.prefix_url, service, &ticket).await?;
    jar.add_private(Cookie::new("user_id", user));
    Ok(())
}

#[get("/set_test_data")]
async fn set_test_data<'a>(cfg_and_lu : CfgAndLU<'a>) -> MyJson {
    action_result(test_data::set(cfg_and_lu).await)
}
#[get("/clear_test_data")]
async fn clear_test_data<'a>(cfg_and_lu : CfgAndLU<'a>) -> MyJson {
    action_result(test_data::clear(&cfg_and_lu).await)
}
#[get("/add_test_data")]
async fn add_test_data<'a>(cfg_and_lu : CfgAndLU<'a>) -> MyJson {
    action_result(test_data::add(cfg_and_lu).await)
}

#[post("/create?<id>", data = "<attrs>")]
async fn create<'a>(id: String, attrs: Json<MonoAttrs>, cfg_and_lu : CfgAndLU<'a>) -> MyJson {
    action_result(
        api::create(cfg_and_lu, &id, attrs.into_inner()).await
    )
}

#[post("/modify?<id>", data = "<attrs>")]
async fn modify<'a>(id: String, attrs: Json<MonoAttrs>, cfg_and_lu : CfgAndLU<'a>) -> MyJson {
    action_result(
        api::modify_sgroup_attrs(cfg_and_lu, &id, attrs.into_inner()).await
    )
}

#[post("/delete?<id>")]
async fn delete<'a>(id: String, cfg_and_lu : CfgAndLU<'a>) -> MyJson {
    action_result(api::delete(cfg_and_lu, &id).await)
}

// curl 'localhost:8000/modify_members_or_rights/?id=foo.bar' -d '{ "member": { "add": [ "ldap:///uid=prigaux2,..." ] } }'
#[post("/modify_members_or_rights?<id>", data = "<mods>")]
async fn modify_members_or_rights<'a>(id: String, mods: Json<MyMods>, cfg_and_lu : CfgAndLU<'a>) -> MyJson {
    action_result(api::modify_members_or_rights(cfg_and_lu, &id, mods.into_inner()).await)
}

#[get("/sgroup?<id>")]
async fn sgroup<'a>(id: String, cfg_and_lu : CfgAndLU<'a>) -> Result<Json<SgroupAndMoreOut>, MyJson> {
    to_json(api::get_sgroup(cfg_and_lu, &id).await)
}

#[get("/sgroup_direct_rights?<id>")]
async fn sgroup_direct_rights<'a>(id: String, cfg_and_lu : CfgAndLU<'a>) -> Result<Json<BTreeMap<Right, Subjects>>, MyJson> {
    to_json(api::get_sgroup_direct_rights(cfg_and_lu, &id).await)
}

#[get("/group_flattened_mright?<id>&<mright>&<search_token>&<sizelimit>")]
async fn group_flattened_mright<'a>(id: String, mright: String, search_token: Option<String>, sizelimit: Option<usize>, cfg_and_lu : CfgAndLU<'a>) -> Result<Json<Subjects>, MyJson> {
    let mright = Mright::from_string(&mright).map_err(err_to_json)?;
    to_json(api::get_group_flattened_mright(cfg_and_lu, &id, mright, search_token, sizelimit).await)
}

#[get("/search_sgroups?<mright>&<search_token>&<sizelimit>")]
async fn search_sgroups<'a>(mright: String, search_token: String, sizelimit: i32, cfg_and_lu : CfgAndLU<'a>) -> Result<Json<SgroupsWithAttrs>, MyJson> {
    let mright = Mright::from_string(&mright).map_err(err_to_json)?;
    to_json(api::search_sgroups(cfg_and_lu, mright, search_token, sizelimit).await)
}

#[get("/mygroups")]
async fn mygroups<'a>(cfg_and_lu : CfgAndLU<'a>) -> Result<Json<SgroupsWithAttrs>, MyJson> {
    to_json(api::mygroups(cfg_and_lu).await)
}

#[get("/search_subjects?<search_token>&<sizelimit>&<source_dn>")]
async fn search_subjects<'a>(search_token: String, sizelimit: i32, source_dn: Option<String>, cfg_and_lu : CfgAndLU<'a>) -> Result<Json<BTreeMap<&String, Subjects>>, MyJson> {
    to_json(api::search_subjects(cfg_and_lu, search_token, sizelimit, source_dn).await)
}

#[get("/config/subject_sources")]
fn config_subject_sources<'a>(cfg_and_lu : CfgAndLU<'a>) -> Json<&Vec<SubjectSourceConfig>> {
    Json(&cfg_and_lu.cfg.ldap.subject_sources)
}
#[get("/config/remotes")]
fn config_remotes<'a>(cfg_and_lu : CfgAndLU<'a>) -> Json<&BTreeMap<String, RemoteConfig>> {
    Json(&cfg_and_lu.cfg.remotes)
}

pub fn routes() -> Vec<Route> {
    routes![
        login,
        clear_test_data, add_test_data, set_test_data, 
        sgroup, sgroup_direct_rights, group_flattened_mright, search_sgroups, search_subjects, mygroups,
        config_subject_sources,
        config_remotes,
        create, modify, delete, modify_members_or_rights,
    ]
}