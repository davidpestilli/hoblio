use std::path::Path;
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use hoblio_model::ActionKind;

use crate::adjust_var::execute_adjust;
use crate::browser::BrowserContext;
use crate::files::{file_append, file_read_into_variable, file_write};
use crate::lists::{list_append, list_clear};
use crate::show_message::spawn_show_message;
use crate::variables::{RunVariables, interpolate};

pub fn execute_action(
    action: &ActionKind,
    browser: &BrowserContext,
    vars: &mut RunVariables,
    project_root: Option<&Path>,
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
            file_write(&path, &content, project_root)
        }
        ActionKind::FileAppend { path, content } => {
            let path = interpolate(path, vars)?;
            let content = interpolate(content, vars)?;
            file_append(&path, &content, project_root)
        }
        ActionKind::FileRead { path, variable } => {
            file_read_into_variable(path, variable, vars, project_root)
        }
        ActionKind::ListAppend {
            list_variable,
            item,
        } => list_append(vars, list_variable, item),
        ActionKind::ListClear { list_variable } => list_clear(vars, list_variable),
        ActionKind::Delay { milliseconds } => {
            thread::sleep(Duration::from_millis(*milliseconds));
            Ok(format!("delay: {milliseconds}ms"))
        }
        ActionKind::HttpGet { url } => http_get(url),
        ActionKind::BrowserNavigate { url, wait_ms } => browser.navigate(url, *wait_ms),
        ActionKind::BrowserClick {
            selector,
            timeout_ms,
            wait_for_navigation,
            wait_selector_after,
            wait_after_timeout_ms,
        } => browser.click(
            selector,
            *timeout_ms,
            wait_for_navigation.unwrap_or(false),
            wait_selector_after.as_deref(),
            *wait_after_timeout_ms,
        ),
        ActionKind::BrowserWaitNavigation { timeout_ms } => {
            browser.wait_navigation(*timeout_ms)
        }
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
        ActionKind::SetVariable { variable, value } => {
            let name = variable.trim();
            if name.is_empty() {
                bail!("set_variable: variable name is empty");
            }
            let resolved = interpolate(value, vars)?;
            vars.insert(name.to_string(), resolved.clone());
            Ok(format!("set_variable: `{name}` = {resolved}"))
        }
        ActionKind::IncreaseVariable { .. } | ActionKind::DecreaseVariable { .. } => {
            execute_adjust(action, vars, 1.0)
        }
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
