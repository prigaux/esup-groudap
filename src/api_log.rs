use std::fs::OpenOptions;
use std::io::SeekFrom;
use std::io::prelude::Write;
use chrono::SecondsFormat;
use tokio::fs::File;
use tokio::io::{self, AsyncReadExt, AsyncSeekExt};
use serde_json::{self, Value, json};

use crate::helpers::after_char;
use crate::my_err::{Result, MyErr};
use crate::my_types::CfgAndLU;

fn sgroup_log_file(log_dir: &str, id: &str) -> String {
    let id = id.replace('/', "_"); // it should not be necessary but...
    format!("{}/{}.jsonl", log_dir, id)
}

async fn read_full_lines<'b>(file_path: &str, bytes: i64, buffer: &'b mut String) -> io::Result<&'b str> {
    let mut f = File::open(file_path).await?;
    let whole_file = f.seek(SeekFrom::End(-bytes)).await.is_err(); // ignore error which means "bytes" > file size
    f.read_to_string(buffer).await?;
    Ok(if whole_file { buffer } else { after_char(buffer, '\n').unwrap_or_default() })
}

fn parse_jsonl(jsonl: &str) -> Result<Vec<Value>> {
    Ok(if jsonl.is_empty() { vec![] } else {
        jsonl.split_terminator('\n').map(|s| serde_json::from_str(s)).collect::<serde_json::Result<_>>()?
    })
}

async fn read_jsonl<'b>(file_path: &str, bytes: i64) -> Result<Value> {
    let mut buffer = String::new();
    let jsonl = read_full_lines(file_path, bytes, &mut buffer).await?;
    Ok(json!(parse_jsonl(jsonl)?))
}

async fn audit(file: &str, mut msg: String) -> io::Result<()> {
    msg.push('\n');
    let mut file = OpenOptions::new().create(true).append(true).open(file)?;
    file.write_all(msg.as_bytes())?;
    Ok(())
}

pub async fn get_sgroup_logs(log_dir: &Option<String>, id: &str, bytes: i64) -> Result<Value> {
    if let Some(log_dir) = log_dir {
        read_jsonl(&sgroup_log_file(log_dir, id), bytes).await
    } else {
        Err(MyErr::Msg(r#"you must configure "log_dir" first"#.to_owned()))
    }
}

pub async fn log_sgroup_action(cfg_and_lu: &CfgAndLU<'_>, id: &str, action: &str, msg: &Option<String>, mut data: Value) -> io::Result<()> {
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
        let file = sgroup_log_file(log_dir, id);
        audit(&file, serde_json::to_string(&json)?).await?;
    }
    Ok(())
}