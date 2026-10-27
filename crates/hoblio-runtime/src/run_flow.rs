use std::collections::{BTreeMap, HashMap};

use anyhow::{Context, Result, bail};
use hoblio_model::{
    ActionKind, FlowGraph, FlowManifest, ProjectVariables, validate_graph,
};
use hoblio_serde::{MAX_RUN_FLOW_DEPTH, ResolvedChildFlow, resolve_child_flow};

use crate::browser::BrowserContext;
use crate::variables::{RunVariables, interpolate, seed_from_project};

pub fn prepare_child_flow(
    project_root: &std::path::Path,
    manifest: &FlowManifest,
    parent_graph: &FlowGraph,
    action: &ActionKind,
    depth: usize,
    flow_cache: &mut HashMap<String, hoblio_serde::LoadedFlowFile>,
) -> Result<ResolvedChildFlow> {
    if depth >= MAX_RUN_FLOW_DEPTH {
        bail!("run_flow exceeds maximum depth {MAX_RUN_FLOW_DEPTH}");
    }
    let resolved = resolve_child_flow(project_root, manifest, parent_graph, action, flow_cache)?;
    validate_graph(resolved.graph()).context("invalid child flow")?;
    Ok(resolved)
}

pub fn apply_inherit_run_flow_inputs(
    inputs: Option<&BTreeMap<String, String>>,
    child_seeds: &ProjectVariables,
    run_vars: &mut RunVariables,
) -> Result<()> {
    for (key, value) in seed_from_project(child_seeds) {
        run_vars.entry(key).or_insert(value);
    }
    if let Some(map) = inputs {
        for (var, template) in map {
            let value = interpolate(template, run_vars)?;
            run_vars.insert(var.clone(), value);
        }
    }
    Ok(())
}

pub fn apply_isolated_run_flow_inputs(
    inputs: Option<&BTreeMap<String, String>>,
    child_seeds: &ProjectVariables,
    parent_vars: &RunVariables,
    child_vars: &mut RunVariables,
) -> Result<()> {
    child_vars.clear();
    for (key, value) in seed_from_project(child_seeds) {
        child_vars.insert(key, value);
    }
    if let Some(map) = inputs {
        for (var, template) in map {
            let value = interpolate(template, parent_vars)?;
            child_vars.insert(var.clone(), value);
        }
    }
    Ok(())
}

pub fn merge_isolated_outputs(
    parent_vars: &mut RunVariables,
    parent_snapshot: RunVariables,
    child_vars: &RunVariables,
    outputs: Option<&Vec<String>>,
) {
    *parent_vars = parent_snapshot;
    let Some(list) = outputs else {
        return;
    };
    if list.is_empty() {
        return;
    }
    for name in list {
        if let Some(value) = child_vars.get(name) {
            parent_vars.insert(name.clone(), value.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::variables::RunVariables;

    #[test]
    fn isolated_without_outputs_does_not_leak_child_vars() {
        let mut parent = RunVariables::from([("y".into(), "pai".into())]);
        let snapshot = parent.clone();
        let mut child = RunVariables::from([("y".into(), "filho".into())]);
        merge_isolated_outputs(&mut parent, snapshot, &child, None);
        assert_eq!(parent.get("y").map(String::as_str), Some("pai"));
        child.insert("z".into(), "extra".into());
        merge_isolated_outputs(&mut parent, RunVariables::from([("y".into(), "pai".into())]), &child, Some(&vec![]));
        assert_eq!(parent.get("y").map(String::as_str), Some("pai"));
        assert!(parent.get("z").is_none());
    }
}

pub fn run_flow_summary(
    flow_ref: &str,
    end_node: &str,
    outputs: Option<&Vec<String>>,
    run_vars: &RunVariables,
) -> String {
    let mut summary = format!("run_flow `{flow_ref}` finished at `{end_node}`");
    if let Some(names) = outputs {
        let mut parts = Vec::new();
        for name in names {
            if let Some(value) = run_vars.get(name) {
                let preview: String = value.chars().take(40).collect();
                parts.push(format!("{name}={preview}"));
            }
        }
        if !parts.is_empty() {
            summary.push_str(&format!(" ({})", parts.join(", ")));
        }
    }
    summary
}

pub fn child_browser_for_action(action: &ActionKind) -> Result<Option<BrowserContext>> {
    let ActionKind::RunFlow { share_browser, .. } = action else {
        bail!("not run_flow");
    };
    if *share_browser == Some(false) {
        Ok(Some(BrowserContext::new()?))
    } else {
        Ok(None)
    }
}

pub fn shutdown_optional_browser(browser: Option<BrowserContext>) {
    if let Some(mut b) = browser {
        b.shutdown();
    }
}
