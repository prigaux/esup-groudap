use std::collections::HashMap;
use std::process::Command;
use chrono::DateTime;
use chrono::offset::FixedOffset;

use crate::helpers::between_and_after;

fn parse_systemd_analyze_output(output: &str) -> HashMap<String, DateTime<FixedOffset>> {
    let mut s = output;
    let mut r = HashMap::new();
    while let Some((event, rest)) = between_and_after(s, "Original form: ", "\n") {
        let (next_elapse, rest) = between_and_after(rest, " (in UTC): ", " UTC\n")
            .or_else(|| between_and_after(rest, "Next elapse: ", "\n"))
            .unwrap_or_else(|| panic!("invalid systemd-analyze output {}", output));
        let next_elapse = DateTime::parse_from_str(&format!("{} +0000", next_elapse), "%a %Y-%m-%d %H:%M:%S %z")
            .unwrap_or_else(|_| panic!("invalid systemd-analyze output: next_elapse ''{}''", next_elapse));
        r.insert(event.to_owned(), next_elapse);
        s = rest;
    }
    r
}

// Cf https://www.freedesktop.org/software/systemd/man/systemd.time.html#Calendar%20Events for the syntax of calendar events
// NB : timezone depends on TZ env var or /etc/localtime
pub fn next_elapses(events: Vec<&String>) -> Result<HashMap<String, DateTime<FixedOffset>>, String> {
    let output = Command::new("/usr/bin/systemd-analyze")
        .args([vec![&"calendar".to_owned()], events].concat())
        .output()
        .expect("Failed to execute systemd-analyze");
    if output.status.success() {
        Ok(parse_systemd_analyze_output(&String::from_utf8(output.stdout).expect("valid utf8")))
    } else {
        Err(String::from_utf8(output.stderr).expect("valid utf8"))
    }
}

pub fn next_elapse(event: &String) -> Result<DateTime<FixedOffset>, String> {
    let mut m = next_elapses(vec![event])?;

    m.remove(event).ok_or("internal error".to_owned())
}