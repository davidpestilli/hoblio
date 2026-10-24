use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use hoblio_model::ActionKind;

use crate::browser::BrowserContext;
use crate::show_message::spawn_show_message;
use crate::variables::{RunVariables, interpolate};

pub fn execute_action(
    action: &ActionKind,
    browser: &BrowserContext,
    vars: &mut RunVariables,
) -> Result<String> {
    match action {
        ActionKind::Log(log) => {
            let message = interpolate(&log.message, vars)?;
            println!("{message}");
            Ok(format!("log: {message}"))
        }
        ActionKind::NoOp => Ok("noop".into()),
        ActionKind::FileWrite { path, content } => {
            let path = interpolate(path, vars)?;
            let content = interpolate(content, vars)?;
            file_write(&path, &content)
        }
        ActionKind::HttpGet { url } => http_get(url),
        ActionKind::BrowserNavigate { url, wait_ms } => browser.navigate(url, *wait_ms),
        ActionKind::BrowserClick {
            selector,
            timeout_ms,
        } => browser.click(selector, *timeout_ms),
        ActionKind::BrowserFill {
            selector,
            text,
            timeout_ms,
        } => browser.fill(selector, text, *timeout_ms),
        ActionKind::BrowserWaitFor {
            selector,
            timeout_ms,
        } => browser.wait_for(selector, *timeout_ms),
        ActionKind::BrowserGetText {
            selector,
            timeout_ms,
            variable,
        } => browser.get_text(selector, *timeout_ms, variable.as_deref(), vars),
        ActionKind::ShowMessage {
            title,
            text,
            timeout_seconds,
        } => show_message(title, text, *timeout_seconds),
    }
}

fn show_message(title: &str, text: &str, timeout_seconds: Option<f64>) -> Result<String> {
    spawn_show_message(title, text, timeout_seconds)?;
    let timeout_note = match timeout_seconds.filter(|&s| s > 0.0) {
        Some(s) => format!("timeout={s}s"),
        None => "until closed".into(),
    };
    Ok(format!(
        "show_message: {:?} ({timeout_note})",
        title
    ))
}

fn file_write(path: &str, content: &str) -> Result<String> {
    let path = Path::new(path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("create parent dirs for {}", path.display()))?;
        }
    }
    fs::write(path, content.as_bytes())
        .with_context(|| format!("write file {}", path.display()))?;
    Ok(format!(
        "file_write: {} ({} bytes)",
        path.display(),
        content.len()
    ))
}

fn http_get(url: &str) -> Result<String> {
    let response = reqwest::blocking::get(url).with_context(|| format!("GET {url}"))?;
    let status = response.status();
    let body = response
        .text()
        .with_context(|| format!("read body from GET {url}"))?;
    let preview: String = body.chars().take(120).collect();
    Ok(format!(
        "http_get: {url} -> {status} ({} bytes): {preview}{}",
        body.len(),
        if body.len() > 120 { "…" } else { "" }
    ))
}
