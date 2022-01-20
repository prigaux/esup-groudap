use std::thread;

#[macro_use]
extern crate maplit;

#[macro_use] 
extern crate rocket;

mod helpers;
mod systemd_calendar_events;
mod my_types;
mod ldap_filter;
mod ldap_wrapper;
mod api;
mod my_ldap;
mod test_data;
mod api_routes;
mod cas_auth;
mod cron;

use rocket::{fairing::AdHoc, fs::FileServer, fs::relative};

#[launch]
fn rocket() -> _ {
    let cache: api_routes::Cache = Default::default();

    let rocket = rocket::build()
        .mount("/api", api_routes::routes())
        .mount("/", FileServer::from(relative!("static/dist")))
        .manage(cache.clone())
        .attach(AdHoc::config::<my_types::Config>());

    let config: my_types::Config = rocket.figment().extract().expect("config");
    thread::spawn(move || cron::the_loop(config, cache));

    rocket
}
