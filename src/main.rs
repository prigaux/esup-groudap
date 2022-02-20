use std::thread;

#[macro_use]
extern crate maplit;

#[macro_use] 
extern crate rocket;

mod helpers;
mod systemd_calendar_events;
mod my_types;
mod my_err;
mod ldap_filter;
mod ldap_wrapper;
mod api_log;
mod api_get;
mod api_post;
mod my_ldap;
mod my_ldap_check_rights;
mod my_ldap_subjects;
mod test_data;
mod api_routes;
mod cas_auth;
mod cron;
mod remote_query;
mod rocket_helpers;

use rocket::{fairing::AdHoc, fs::FileServer, fs::relative};

#[launch]
fn rocket() -> _ {
    let cache: rocket_helpers::Cache = Default::default();

    let rocket = rocket::build()
        .mount("/api", api_routes::routes())
        .mount("/", FileServer::from(relative!("ui/dist")))
        .mount("/", routes![rocket_helpers::handle_js_ui_routes])
        .manage(cache.clone())
        .attach(AdHoc::config::<my_types::Config>());

    let config: my_types::Config = rocket.figment().extract().expect("config");
    thread::spawn(move || cron::the_loop(config, cache));

    rocket
}
