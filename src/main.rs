#[macro_use]
extern crate maplit;

#[macro_use] 
extern crate rocket;

mod my_types;
mod api;
mod my_ldap;
mod test_data;
mod api_routes;
mod cas_auth;

use rocket::{fairing::AdHoc};

#[launch]
fn rocket() -> _ {
    rocket::build()
        .mount("/", api_routes::routes())
        .attach(AdHoc::config::<my_types::Config>())
}
