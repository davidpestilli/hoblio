use anyhow::{Context, Result, bail};
use serde_json::Value;

use crate::expr::parse_string_list;
use crate::variables::{RunVariables, interpolate};

pub fn list_clear(vars: &mut RunVariables, list_variable: &str) -> Result<String> {
    let name = list_variable.trim();
    if name.is_empty() {
        bail!("list_clear: variable name is empty");
    }
    vars.insert(name.to_string(), "[]".into());
    Ok(format!("list_clear: `{name}`"))
}

pub fn list_append(
    vars: &mut RunVariables,
    list_variable: &str,
    item_template: &str,
) -> Result<String> {
    let name = list_variable.trim();
    if name.is_empty() {
        bail!("list_append: variable name is empty");
    }
    let item = interpolate(item_template, vars)?;
    let mut items = read_list_var(vars, name)?;
    items.push(item.clone());
    write_list_var(vars, name, &items)?;
    Ok(format!("list_append: `{name}` (+1 item, len={})", items.len()))
}

fn read_list_var(vars: &RunVariables, name: &str) -> Result<Vec<String>> {
    match vars.get(name) {
        Some(raw) => parse_string_list(raw).with_context(|| format!("variable `{name}` is not a list")),
        None => Ok(vec![]),
    }
}

fn write_list_var(vars: &mut RunVariables, name: &str, items: &[String]) -> Result<()> {
    let value: Value = items.iter().cloned().map(Value::String).collect();
    vars.insert(
        name.to_string(),
        serde_json::to_string(&value).context("serialize list")?,
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn append_creates_list() {
        let mut vars = RunVariables::new();
        list_append(&mut vars, "items", "alpha").unwrap();
        list_append(&mut vars, "items", "beta").unwrap();
        assert_eq!(
            parse_string_list(vars.get("items").unwrap()).unwrap(),
            vec!["alpha", "beta"]
        );
    }

    #[test]
    fn clear_empties_list() {
        let mut vars = RunVariables::new();
        list_append(&mut vars, "items", "x").unwrap();
        list_clear(&mut vars, "items").unwrap();
        assert_eq!(parse_string_list(vars.get("items").unwrap()).unwrap(), Vec::<String>::new());
    }
}
