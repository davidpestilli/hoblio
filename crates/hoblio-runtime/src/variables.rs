use std::collections::HashMap;

use anyhow::{Context, Result, bail};
use hoblio_model::ProjectVariables;

pub type RunVariables = HashMap<String, String>;

pub fn seed_from_project(values: &ProjectVariables) -> RunVariables {
    let mut vars = RunVariables::new();
    for (key, value) in values {
        if let Some(s) = value.as_str() {
            vars.insert(key.clone(), s.to_string());
        } else if value.is_array() || value.is_object() {
            if let Ok(json) = serde_json::to_string(value) {
                vars.insert(key.clone(), json);
            }
        } else if value.is_number() || value.is_boolean() {
            vars.insert(key.clone(), value.to_string());
        }
    }
    vars
}

/// Replace `{name}` placeholders using run variables (PAD-style `%name%` not used yet).
pub fn interpolate(template: &str, vars: &RunVariables) -> Result<String> {
    if !template.contains('{') {
        return Ok(template.to_string());
    }

    let mut out = String::new();
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        out.push_str(&rest[..start]);
        rest = &rest[start + 1..];
        let end = rest
            .find('}')
            .context("unclosed `{` in text — use `{variable_name}`")?;
        let name = &rest[..end];
        if name.is_empty() {
            bail!("empty variable name in `{{}}`");
        }
        if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            bail!("invalid variable name `{name}` in template");
        }
        let value = vars
            .get(name)
            .with_context(|| format!("variable `{name}` is not set (assign with browser_get_text or flow variables)"))?;
        out.push_str(value);
        rest = &rest[end + 1..];
    }
    out.push_str(rest);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpolate_replaces_known_vars() {
        let mut vars = RunVariables::new();
        vars.insert("page_heading".into(), "Hello".into());
        assert_eq!(
            interpolate("Title: {page_heading}", &vars).unwrap(),
            "Title: Hello"
        );
    }

    #[test]
    fn interpolate_errors_on_missing_var() {
        assert!(interpolate("{missing}", &RunVariables::new()).is_err());
    }
}
