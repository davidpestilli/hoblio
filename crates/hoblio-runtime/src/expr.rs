use anyhow::{Context, Result};
use hoblio_model::{CompareOperator, IfControl};

use crate::variables::RunVariables;

pub fn resolve_operand(raw: &str, vars: &RunVariables) -> Result<String> {
    let trimmed = raw.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') && trimmed.len() >= 2 {
        let name = &trimmed[1..trimmed.len() - 1];
        return vars
            .get(name)
            .cloned()
            .with_context(|| format!("variable `{name}` is not set"));
    }
    if vars.contains_key(trimmed) {
        return Ok(vars.get(trimmed).cloned().unwrap());
    }
    Ok(trimmed.to_string())
}

fn is_numeric_operator(op: CompareOperator) -> bool {
    matches!(
        op,
        CompareOperator::Gt
            | CompareOperator::Gte
            | CompareOperator::Lt
            | CompareOperator::Lte
    )
}

/// Parse a run variable or literal as a number (PAD-style numeric conditions).
pub fn parse_number(raw: &str) -> Result<f64> {
    let trimmed = raw.trim();
    trimmed
        .parse::<f64>()
        .with_context(|| format!("expected a number, got `{trimmed}`"))
}

pub fn eval_if(cfg: &IfControl, vars: &RunVariables) -> Result<bool> {
    let left = resolve_operand(&cfg.left, vars)?;
    let right = resolve_operand(&cfg.right, vars)?;

    if is_numeric_operator(cfg.operator) {
        let l = parse_number(&left)?;
        let r = parse_number(&right)?;
        return Ok(match cfg.operator {
            CompareOperator::Gt => l > r,
            CompareOperator::Gte => l >= r,
            CompareOperator::Lt => l < r,
            CompareOperator::Lte => l <= r,
            _ => unreachable!(),
        });
    }

    let (left, right) = if cfg.ignore_case {
        (left.to_ascii_lowercase(), right.to_ascii_lowercase())
    } else {
        (left, right)
    };
    Ok(match cfg.operator {
        CompareOperator::Eq => left == right,
        CompareOperator::Ne => left != right,
        CompareOperator::Contains => left.contains(&right),
        CompareOperator::Gt | CompareOperator::Gte | CompareOperator::Lt | CompareOperator::Lte => {
            unreachable!()
        }
    })
}

pub fn parse_string_list(raw: &str) -> Result<Vec<String>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    let value: serde_json::Value =
        serde_json::from_str(trimmed).context("list variable must be a JSON array string")?;
    let arr = value.as_array().context("list variable must be a JSON array")?;
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        match item {
            serde_json::Value::String(s) => out.push(s.clone()),
            serde_json::Value::Number(n) => out.push(n.to_string()),
            serde_json::Value::Bool(b) => out.push(b.to_string()),
            serde_json::Value::Null => out.push(String::new()),
            other => out.push(other.to_string()),
        }
    }
    Ok(out)
}

pub fn list_from_vars(name: &str, vars: &RunVariables) -> Result<Vec<String>> {
    let raw = vars
        .get(name)
        .with_context(|| format!("list variable `{name}` is not set"))?;
    parse_string_list(raw).or_else(|_| Ok(vec![raw.clone()]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eval_if_lt_numeric() {
        let mut vars = RunVariables::new();
        vars.insert("counter".into(), "3".into());
        let cfg = IfControl {
            left: "{counter}".into(),
            operator: CompareOperator::Lt,
            right: "4".into(),
            ignore_case: false,
        };
        assert!(eval_if(&cfg, &vars).unwrap());
    }

    #[test]
    fn eval_if_eq() {
        let mut vars = RunVariables::new();
        vars.insert("mode".into(), "yes".into());
        let cfg = IfControl {
            left: "{mode}".into(),
            operator: CompareOperator::Eq,
            right: "yes".into(),
            ignore_case: true,
        };
        assert!(eval_if(&cfg, &vars).unwrap());
    }

    #[test]
    fn parse_json_list() {
        assert_eq!(
            parse_string_list(r#"["a","b"]"#).unwrap(),
            vec!["a".to_string(), "b".to_string()]
        );
    }
}
