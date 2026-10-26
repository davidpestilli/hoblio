use anyhow::{Result, bail};
use hoblio_model::ActionKind;

use crate::expr::parse_number;
use crate::variables::{RunVariables, interpolate};

pub fn adjust_variable(
    vars: &mut RunVariables,
    variable: &str,
    amount: Option<&str>,
    sign: f64,
) -> Result<String> {
    let name = variable.trim();
    if name.is_empty() {
        bail!("variable name is empty");
    }
    let amount_raw = match amount {
        Some(a) => interpolate(a, vars)?,
        None => "1".into(),
    };
    let delta = parse_number(&amount_raw)? * sign;
    let current = vars.get(name).map(|s| s.as_str()).unwrap_or("0");
    let base = parse_number(current).unwrap_or(0.0);
    let new_val = base + delta;
    let stored = format_number(new_val);
    vars.insert(name.to_string(), stored.clone());
    Ok(stored)
}

fn format_number(n: f64) -> String {
    let rounded = n.round();
    if (n - rounded).abs() < 1e-9 {
        format!("{}", rounded as i64)
    } else {
        format!("{n}")
    }
}

pub fn execute_adjust(action: &ActionKind, vars: &mut RunVariables, sign: f64) -> Result<String> {
    match action {
        ActionKind::IncreaseVariable { variable, amount } => {
            let stored = adjust_variable(vars, variable, amount.as_deref(), sign.abs())?;
            Ok(format!("increase_variable: `{variable}` -> {stored}"))
        }
        ActionKind::DecreaseVariable { variable, amount } => {
            let stored = adjust_variable(vars, variable, amount.as_deref(), -sign.abs())?;
            Ok(format!("decrease_variable: `{variable}` -> {stored}"))
        }
        _ => bail!("not an adjust variable action"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn increase_from_missing_treats_as_zero() {
        let mut vars = RunVariables::new();
        adjust_variable(&mut vars, "counter", None, 1.0).unwrap();
        assert_eq!(vars.get("counter").map(|s| s.as_str()), Some("1"));
    }
}
