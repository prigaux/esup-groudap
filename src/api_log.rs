use std::fs::OpenOptions;
use std::io::prelude::Write;
use chrono::SecondsFormat;
use tokio::io;
use serde_json::{self, Value, json};

use crate::my_types::CfgAndLU;

async fn audit(file: &str, mut msg: String) -> io::Result<()> {
    msg.push('\n');
    let mut file = OpenOptions::new().create(true).append(true).open(file)?;
    file.write_all(msg.as_bytes())?;
    Ok(())
}

pub async fn sgroup(cfg_and_lu: &CfgAndLU<'_>, id: &str, action: &str, msg: &Option<String>, mut data: Value) -> io::Result<()> {
    if let Some(log_dir) = &cfg_and_lu.cfg.log_dir {
        let mut common_json = json!({ 
            "action": action, 
            "when": chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            "who": cfg_and_lu.user.to_str(),
        });
        let json = common_json.as_object_mut().expect("internal error");
        if let Some(msg) = msg {
            json.insert("msg".to_owned(), json!(msg));
        }
        json.append(data.as_object_mut().expect("map expected"));
        let id = id.replace('/', "_"); // it should not be necessary but...
        let file = format!("{}/{}.jsonl", log_dir, id);
        audit(&file, serde_json::to_string(&json)?).await?;
    }
    Ok(())
}