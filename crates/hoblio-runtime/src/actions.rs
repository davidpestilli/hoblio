use std::path::Path;
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use hoblio_model::ActionKind;

use crate::adjust_var::execute_adjust;
use crate::browser::BrowserContext;
use crate::files::{file_append, file_read_into_variable, file_write};
use crate::lists::{list_append, list_clear};
use crate::show_get_user_input::run_show_get_user_input;
use crate::show_message::run_show_message;
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
        ActionKind::BrowserNavigate {
            url,
            wait_ms,
            show_on_screen,
            start_maximized,
        } => browser.navigate(url, *wait_ms, *show_on_screen, *start_maximized),
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
        } => {
            let selector = interpolate(selector, vars)?;
            let text = interpolate(text, vars)?;
            browser.fill(&selector, &text, *timeout_ms)
        }
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
        } => show_message(title, text, *timeout_seconds, vars),
        ActionKind::ShowGetUserInput {
            title,
            message,
            default_value,
            input_kind,
            topmost,
            user_input_variable,
            button_pressed_variable,
        } => show_get_user_input(
            title,
            message,
            default_value,
            *input_kind,
            topmost.unwrap_or(false),
            user_input_variable,
            button_pressed_variable,
            vars,
        ),
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

fn show_get_user_input(
    title: &str,
    message: &str,
    default_value: &str,
    input_kind: hoblio_model::UserInputKind,
    topmost: bool,
    user_input_variable: &str,
    button_pressed_variable: &str,
    vars: &mut RunVariables,
) -> Result<String> {
    let user_var = user_input_variable.trim();
    let button_var = button_pressed_variable.trim();
    if user_var.is_empty() || button_var.is_empty() {
        bail!("show_get_user_input: output variable names must not be empty");
    }
    let title = interpolate(title, vars)?;
    let message = interpolate(message, vars)?;
    let default_value = interpolate(default_value, vars)?;
    let result = run_show_get_user_input(
        &title,
        &message,
        &default_value,
        input_kind,
        topmost,
    )?;
    vars.insert(user_var.to_string(), result.user_input.clone());
    vars.insert(button_var.to_string(), result.button_pressed.clone());
    Ok(format!(
        "show_get_user_input: button={} user_input={:?}",
        result.button_pressed, result.user_input
    ))
}

fn show_message(
    title: &str,
    text: &str,
    timeout_seconds: Option<f64>,
    vars: &RunVariables,
) -> Result<String> {
    let title = interpolate(title, vars)?;
    let text = interpolate(text, vars)?;
    run_show_message(&title, &text, timeout_seconds)?;
    let timeout_note = match timeout_seconds.filter(|&s| s > 0.0) {
        Some(s) => format!("timeout={s}s"),
        None => "until closed".into(),
    };
    Ok(format!(
        "show_message: {:?} ({timeout_note})",
        title
    ))
}

/// Values written by this action, for run events / Studio (after `execute_action`).
pub fn snapshot_action_variables(
    action: &ActionKind,
    vars: &RunVariables,
) -> Option<std::collections::HashMap<String, String>> {
    let mut out = std::collections::HashMap::new();
    for name in action.produced_variables() {
        if let Some(value) = vars.get(name) {
            out.insert(name.to_string(), value.clone());
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

#[cfg(test)]
mod snapshot_tests {
    use super::*;
    use hoblio_model::ActionKind;

    #[test]
    fn snapshot_includes_browser_get_text_variable() {
        let action = ActionKind::BrowserGetText {
            selector: "h1".into(),
            timeout_ms: None,
            variable: Some("BrowserText1".into()),
        };
        let mut vars = RunVariables::new();
        vars.insert("BrowserText1".into(), "Título da página".into());
        let snap = snapshot_action_variables(&action, &vars).expect("snapshot");
        assert_eq!(snap.get("BrowserText1").map(String::as_str), Some("Título da página"));
    }
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
