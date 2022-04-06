use std::{collections::HashMap, hash::Hash};

pub fn after_char(s: &str, start: char) -> Option<&str> {
    let pos = s.find(start)?;
    Some(&s[pos + 1..])
}

pub fn after<'a>(s : &'a str, start: &str) -> Option<&'a str> {
    let pos = s.find(start)?;
    Some(&s[pos + start.len() ..])
}

pub fn after_last<'a>(s : &'a str, start: &str) -> Option<&'a str> {
    let pos = s.rfind(start)?;
    Some(&s[pos + start.len() ..])
}

pub fn before<'a>(s: &'a str, end: &str) -> Option<&'a str> {
    Some(&s[..s.find(end)?])
}

pub fn between<'a>(s: &'a str, start: &'a str, end: &str) -> Option<&'a str> {
    after(s, start).and_then(|s| before(s, end))
}

pub fn before_and_after<'a>(s: &'a str, end: &str) -> Option<(&'a str, &'a str)> {
    let pos = s.find(end)?;
    Some((&s[..pos], &s[pos + end.len() ..]))
}

pub fn before_and_after_char<'a>(s: &'a str, end: char) -> Option<(&'a str, &'a str)> {
    let pos = s.find(end)?;
    Some((&s[..pos], &s[pos + 1 ..]))
}

pub fn before_and_between_and_after<'a>(s: &'a str, start: &'a str, end: &str) -> Option<(&'a str, &'a str, &'a str)> {
    before_and_after(s, start).and_then(|(beg, s)| 
        before_and_after(s, end).map(|(between, end)| ((beg, between, end)))
    )
}

pub fn between_and_after<'a>(s: &'a str, start: &'a str, end: &str) -> Option<(&'a str, &'a str)> {
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

// yyyymmddhhmmssZ => yyyy-mm-ddThh:mm:ss
pub fn generalized_time_to_ISO8601(gtime: &str) -> Option<String> {
    let mut r = String::with_capacity(20);

    for (index, c) in gtime.chars().enumerate() {
        match index {
            4  |  6 => r.push('-'),
                  8 => r.push('T'),
            10 | 12 => r.push(':'),
            14 => if c == 'Z' { return Some(r) },
            _ => {},
        }
        r.push(c);
    }
    return None

}

pub fn hashmap_difference<K: Eq + Hash + Clone, V: Eq + Clone>(m1: &HashMap<K,V>, m2 : &HashMap<K,V>) -> HashMap<K,V> {
    let mut r = hashmap![];
    for (k,v) in m1.iter() {
        if m2.get(k) != Some(v) {
            r.insert(k.clone(), v.clone());
        }
    }
    r
}

/*
fn map_with_preview<
        T,
        F : Fn(T, &Option<T>) -> T,
        I : Iterator<Item = T>,
> (mut iter: I, f: F) -> Vec<T> {
    let mut r = vec![];

    if let Some(mut elt) = iter.next() {
        loop {
            let preview = iter.next();
            r.push(f(elt, &preview));
            match preview {
                Some(preview) => elt = preview,
                None => break,
            }
        }
    }
    r
}

fn map_rev_with_preview<T, F : Fn(T, &Option<T>) -> T> (vec: Vec<T>, f: F) -> Vec<T> {
    let mut r=  map_with_preview(vec.into_iter().rev(), f);
    r.reverse();
    r
}
*/
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_before_and_between_and_after() {
        assert_eq!(before_and_between_and_after("", "<", ">"), None);
        assert_eq!(before_and_between_and_after("<>", "<", ">"), Some(("", "", "")));
        assert_eq!(before_and_between_and_after("a<", "<", ">"), None);
        assert_eq!(before_and_between_and_after("a>", "<", ">"), None);
        assert_eq!(before_and_between_and_after("a<b>", "<", ">"), Some(("a", "b", "")));
        assert_eq!(before_and_between_and_after("a<b>c", "<", ">"), Some(("a", "b", "c")));
    }

    #[test]
    fn test_hashmap_difference() {
        let empty: HashMap<&str, &str> = hashmap![];
        assert_eq!(hashmap_difference(&empty, &empty), hashmap![]);
        assert_eq!(hashmap_difference(&hashmap!["k" => "v"], &hashmap![           ]), hashmap!["k" => "v"]);
        assert_eq!(hashmap_difference(&hashmap!["k" => "v"], &hashmap!["k2" => "v"]), hashmap!["k" => "v"]);
        assert_eq!(hashmap_difference(&hashmap!["k" => "v"], &hashmap!["k2" => "v"]), hashmap!["k" => "v"]);
        assert_eq!(hashmap_difference(&hashmap!["k" => "v"], &hashmap!["k"  => "v"]), hashmap![]);
        assert_eq!(hashmap_difference(&hashmap![          ], &hashmap!["k"  => "v"]), hashmap![]);
        assert_eq!(hashmap_difference(&hashmap!["k" => "v", "k2" => "v"], &hashmap!["k2" => "v"]), hashmap!["k" => "v"]);
    }

    #[test]
    fn test_generalized_time_to_ISO8601() {
        assert_eq!(generalized_time_to_ISO8601("20991231235959Z"), Some("2099-12-31T23:59:59".to_owned()));
        assert_eq!(generalized_time_to_ISO8601("20991231235959Z "), Some("2099-12-31T23:59:59".to_owned()));
        assert_eq!(generalized_time_to_ISO8601("20991231235959"), None);
        assert_eq!(generalized_time_to_ISO8601("20991231235959 "), None);
    }
/*
    #[test]
    fn test_map_rev_with_preview() {
        let v = vec!["a".to_owned(), "a:b".to_owned(), "a:b:c".to_owned()];

        let r = map_rev_with_preview(v, |elt, parent| {
            match parent {
                Some(parent) => elt.trim_start_matches(parent).trim_start_matches(":").to_owned(),
                None => elt,
            }
        });
        assert_eq!(r, vec!["a".to_owned(), "b".to_owned(), "c".to_owned()]);    
    }

}
*/