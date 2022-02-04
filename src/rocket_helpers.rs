
use std::time::SystemTime;
use std::{sync::{Arc, Mutex}, collections::HashMap};

use rocket::{State};
use rocket::fs::{NamedFile, relative};
use rocket::http::{Status, ContentType};

use rocket::outcome::{Outcome, try_outcome};
use rocket::request::{self, FromRequest, Request};
use rocket::response::{self, Responder, Response};
use rocket::serde::json::{json, Json};
use rocket::tokio::io;

use crate::helpers::{parse_host_and_port, build_url_from_parts};
use crate::ldap_wrapper::Result;
use crate::my_types::{Config, CfgAndLU, LoggedUser};

pub struct IsJsUiRoute;

#[rocket::async_trait]
impl<'r> FromRequest<'r> for IsJsUiRoute {
    type Error = ();
    async fn from_request(req: &'r Request<'_>) -> request::Outcome<Self, ()> {
        match req.uri().path().as_str() {
            // keep in sync with ui/src/router/index.ts "routes" "path"
            "/" | "/sgroup" => Outcome::Success(IsJsUiRoute),
            _ => Outcome::Forward(()),
        }
    }
}

#[get("/<_..>")]
pub async fn handle_js_ui_routes(_is: IsJsUiRoute) -> io::Result<NamedFile> {
    NamedFile::open(relative!("ui/dist/index.html")).await
}


#[derive(Clone, Default)]
pub struct Cache {
    pub synchronized_groups: Arc<Mutex<Option<(SystemTime, Arc<HashMap<String, String>>)>>>,
}

pub struct OrigUrl(pub String);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for OrigUrl {
    type Error = ();

    async fn from_request(request: &'r Request<'_>) -> request::Outcome<Self, ()> {
        if let Some(host) = request.headers().get_one("Host") {
            let (host_only, port) = parse_host_and_port(host);
            Outcome::Success(OrigUrl(build_url_from_parts(
                request.headers().get_one("X-Forwarded-Proto"),
                host_only, request.headers().get_one("X-Forwarded-Port").or(port),
                request.uri().to_string().as_ref(),
            )))
        } else {
            Outcome::Failure((Status::InternalServerError, ()))
        }
    }
}

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

pub struct MyJson { status: Status, body: String }

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

pub fn err_to_json(err: impl ToString + std::fmt::Debug) -> MyJson {
    dbg!(&err); 
    let body = json!({
        "error": true,
        "msg": err.to_string(),
    });
    MyJson::new(Status::InternalServerError, body.to_string())
}

pub fn to_json<T>(r: Result<T>) -> std::result::Result<Json<T>, MyJson> {
    r.map(Json).map_err(err_to_json)
}

pub fn action_result(r : Result<()>) -> MyJson {
    match r {
        Err(err) => err_to_json(err),
        Ok(_) => {
            let body = json!({ "ok": true });
            MyJson::new(Status::Ok, body.to_string())
        },
    }
}
