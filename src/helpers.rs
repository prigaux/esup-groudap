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

