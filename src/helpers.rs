pub fn after<'a>(s : &'a str, start: &'a str) -> Option<&'a str> {
    let pos = s.find(start)?;
    Some(&s[pos + start.len() ..])
}

pub fn before<'a>(s: &'a str, end: &'a str) -> Option<&'a str> {
    Some(&s[..s.find(end)?])
}

pub fn between<'a>(s: &'a str, start: &'a str, end: &'a str) -> Option<&'a str> {
    after(s, start).and_then(|s| before(s, end))
}

pub fn before_and_after<'a>(s: &'a str, end: &'a str) -> Option<(&'a str, &'a str)> {
    let pos = s.find(end)?;
    Some((&s[..pos], &s[pos + end.len() ..]))
}

pub fn between_and_after<'a>(s: &'a str, start: &'a str, end: &'a str) -> Option<(&'a str, &'a str)> {
    after(s, start).and_then(|s| before_and_after(s, end))
}

pub fn build_url_from_parts(scheme: Option<&str>, host_only: &str, port: Option<&str>, path_and_query: &str) -> String {
    let scheme = scheme.unwrap_or_else(|| {
        match port {
            Some("443") | Some("8443") => "https",
            _ => "http",
        }
    });
    match port {
        Some(port) if port != "80" && port != "443" => 
            format!("{}://{}:{}{}", scheme, host_only, port, path_and_query),
        _ => 
            format!("{}://{}{}", scheme, host_only, path_and_query),
    }
}

pub fn parse_host_and_port(host: &str) -> (&str, Option<&str>) {
    match before_and_after(host, ":") {
        Some((host_only, port)) => (host_only, Some(port)),
        _ => (host, None),
    }
}

