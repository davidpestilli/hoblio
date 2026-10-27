use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use hoblio_model::{
    ActionKind, FlowGraph, FlowManifest, FlowProject, ProjectVariables, SubflowBundle,
    ValidationError, validate_graph,
};
use serde_json::Value;

use crate::FLOW_FILE;

pub const MAX_RUN_FLOW_DEPTH: usize = 16;

/// Resolve a project-relative flow path and reject escapes (`../`) and absolute paths.
pub fn resolve_project_flow_path(project_root: &Path, relative: &str) -> Result<PathBuf> {
    if relative.trim().is_empty() {
        bail!("flow path is empty");
    }
    if Path::new(relative).is_absolute() {
        bail!("flow path must be relative to the project root");
    }
    let joined = project_root.join(relative);
    let canonical_root = project_root
        .canonicalize()
        .with_context(|| format!("canonicalize project root {}", project_root.display()))?;
    let canonical = joined
        .canonicalize()
        .with_context(|| format!("resolve flow path `{relative}`"))?;
    if !canonical.starts_with(&canonical_root) {
        bail!(
            "flow path `{relative}` resolves outside the project root ({})",
            project_root.display()
        );
    }
    Ok(canonical)
}

#[derive(Debug, Clone)]
pub struct LoadedFlowFile {
    pub graph: FlowGraph,
    pub variables: ProjectVariables,
    pub path: PathBuf,
}

#[derive(Debug, Clone)]
pub enum ResolvedChildFlow {
    File(LoadedFlowFile),
    Inline {
        label: String,
        graph: FlowGraph,
        variables: ProjectVariables,
    },
}

impl ResolvedChildFlow {
    pub fn graph(&self) -> &FlowGraph {
        match self {
            Self::File(f) => &f.graph,
            Self::Inline { graph, .. } => graph,
        }
    }

    pub fn variables(&self) -> &ProjectVariables {
        match self {
            Self::File(f) => &f.variables,
            Self::Inline { variables, .. } => variables,
        }
    }

    pub fn label(&self) -> String {
        match self {
            Self::File(f) => f.path.to_string_lossy().into_owned(),
            Self::Inline { label, .. } => label.clone(),
        }
    }
}

pub fn load_flow_file(path: &Path) -> Result<LoadedFlowFile> {
    if !path.is_file() {
        bail!("flow file not found: {}", path.display());
    }
    let flow_doc: Value = read_json_value(path)?;
    let graph: FlowGraph = serde_json::from_value(flow_doc.clone()).with_context(|| {
        format!("invalid flow schema in {}", path.display())
    })?;
    let variables = flow_doc
        .get("variables")
        .cloned()
        .map(|v| serde_json::from_value(v))
        .transpose()
        .with_context(|| format!("invalid variables in {}", path.display()))?
        .unwrap_or_default();
    Ok(LoadedFlowFile {
        graph,
        variables,
        path: path.to_path_buf(),
    })
}

pub fn resolve_child_flow(
    project_root: &Path,
    manifest: &FlowManifest,
    parent_graph: &FlowGraph,
    action: &ActionKind,
    flow_cache: &mut HashMap<String, LoadedFlowFile>,
) -> Result<ResolvedChildFlow> {
    let ActionKind::RunFlow { flow_id, path, .. } = action else {
        bail!("not a run_flow action");
    };
    if let Some(id) = flow_id.as_deref().filter(|s| !s.is_empty()) {
        if let Some(subflows) = &parent_graph.subflows {
            if let Some(bundle) = subflows.get(id) {
                return Ok(ResolvedChildFlow::Inline {
                    label: format!("subflow:{id}"),
                    graph: bundle.as_graph_with_subflows(parent_graph.subflows.as_ref()),
                    variables: bundle.variables.clone(),
                });
            }
        }
        if let Some(entry) = manifest.flows.as_ref().and_then(|m| m.get(id)) {
            let target = resolve_project_flow_path(project_root, &entry.path)?;
            let loaded = load_flow_cached(flow_cache, &target)?;
            return Ok(ResolvedChildFlow::File(loaded));
        }
        bail!("run_flow flow_id `{id}` not found in subflows or manifest.flows");
    }
    if let Some(rel) = path.as_deref().filter(|s| !s.is_empty()) {
        let target = resolve_project_flow_path(project_root, rel)?;
        let loaded = load_flow_cached(flow_cache, &target)?;
        return Ok(ResolvedChildFlow::File(loaded));
    }
    bail!("run_flow requires flow_id or path");
}

/// Resolve the on-disk path for a `run_flow` action (file targets only).
pub fn resolve_run_flow_path(
    project_root: &Path,
    manifest: &FlowManifest,
    action: &ActionKind,
) -> Result<PathBuf> {
    let ActionKind::RunFlow { flow_id, path, .. } = action else {
        bail!("not a run_flow action");
    };
    if let Some(id) = flow_id.as_deref().filter(|s| !s.is_empty()) {
        let entry = manifest
            .flows
            .as_ref()
            .and_then(|m| m.get(id))
            .with_context(|| format!("manifest.flows has no entry `{id}`"))?;
        return resolve_project_flow_path(project_root, &entry.path);
    }
    if let Some(rel) = path.as_deref().filter(|s| !s.is_empty()) {
        return resolve_project_flow_path(project_root, rel);
    }
    bail!("run_flow requires flow_id or path");
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProjectFlowEntry {
    pub id: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

pub fn list_project_flows(manifest: &FlowManifest) -> Vec<ProjectFlowEntry> {
    let mut out = Vec::new();
    let entry = manifest.entry_flow.as_deref().unwrap_or(FLOW_FILE);
    out.push(ProjectFlowEntry {
        id: "entry".into(),
        path: entry.into(),
        description: Some("Entry / orchestrator".into()),
    });
    if let Some(flows) = &manifest.flows {
        for (id, meta) in flows {
            if meta.path == entry {
                continue;
            }
            out.push(ProjectFlowEntry {
                id: id.clone(),
                path: meta.path.clone(),
                description: meta.description.clone(),
            });
        }
    }
    out
}

pub fn save_flow_document(
    project_root: &Path,
    relative_path: &str,
    graph: &FlowGraph,
    variables: &ProjectVariables,
) -> Result<()> {
    let path = project_root.join(relative_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create dir {}", parent.display()))?;
    }
    let mut value = serde_json::to_value(graph).context("serialize flow")?;
    if let Value::Object(ref mut map) = value {
        if !variables.is_empty() {
            map.insert(
                "variables".into(),
                serde_json::to_value(variables).context("serialize variables")?,
            );
        }
    }
    let text = serde_json::to_string_pretty(&value).context("json encode")?;
    std::fs::write(&path, format!("{text}\n"))
        .with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

pub fn validate_project_composition(
    project_root: &Path,
    project: &FlowProject,
) -> Result<(), ValidationError> {
    let entry = project
        .manifest
        .entry_flow
        .as_deref()
        .unwrap_or(FLOW_FILE);
    let entry_path = project_root.join(entry);
    let mut stack: Vec<String> = Vec::new();
    let mut visiting: HashSet<String> = HashSet::new();
    let mut visited: HashSet<String> = HashSet::new();
    validate_flow_file_composition(
        project_root,
        &project.manifest,
        &entry_path,
        0,
        &mut stack,
        &mut visiting,
        &mut visited,
    )
}

fn normalize_key(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn validate_flow_file_composition(
    project_root: &Path,
    manifest: &FlowManifest,
    flow_path: &Path,
    depth: usize,
    stack: &mut Vec<String>,
    visiting: &mut HashSet<String>,
    visited: &mut HashSet<String>,
) -> Result<(), ValidationError> {
    if depth > MAX_RUN_FLOW_DEPTH {
        return Err(ValidationError::RunFlowDepthExceeded(MAX_RUN_FLOW_DEPTH));
    }
    let key = normalize_key(flow_path);
    if visiting.contains(&key) {
        let cycle = format!("{} -> {}", stack.join(" -> "), key);
        return Err(ValidationError::RunFlowCycle(cycle));
    }
    if visited.contains(&key) {
        return Ok(());
    }

    let loaded = load_flow_file(flow_path).map_err(|_| {
        ValidationError::RunFlowTargetNotFound(flow_path.display().to_string(), "project".into())
    })?;
    validate_graph(&loaded.graph)?;

    visiting.insert(key.clone());
    stack.push(key.clone());

    walk_run_flow_targets(
        project_root,
        manifest,
        &loaded.graph,
        loaded.graph.subflows.as_ref(),
        depth,
        stack,
        visiting,
        visited,
        &mut Vec::new(),
    )?;

    stack.pop();
    visiting.remove(&key);
    visited.insert(key);
    Ok(())
}

fn walk_run_flow_targets(
    project_root: &Path,
    manifest: &FlowManifest,
    graph: &FlowGraph,
    file_subflows: Option<&BTreeMap<String, SubflowBundle>>,
    depth: usize,
    stack: &mut Vec<String>,
    visiting: &mut HashSet<String>,
    visited: &mut HashSet<String>,
    inline_stack: &mut Vec<String>,
) -> Result<(), ValidationError> {
    let embedded = graph.subflows.as_ref().or(file_subflows);
    for node in &graph.nodes {
        let Some(action) = &node.action else {
            continue;
        };
        let ActionKind::RunFlow { flow_id, path, .. } = action else {
            continue;
        };
        if let Some(id) = flow_id.as_deref().filter(|s| !s.is_empty()) {
            if embedded.is_some_and(|m| m.contains_key(id)) {
                let map = embedded.unwrap();
                validate_inline_subflow(
                    project_root,
                    manifest,
                    map,
                    id,
                    depth + 1,
                    stack,
                    visiting,
                    visited,
                    inline_stack,
                )?;
                continue;
            }
        }
        let target = resolve_run_flow_path(project_root, manifest, action).map_err(|e| {
            ValidationError::RunFlowTargetNotFound(
                format!("node `{}`: {e}", node.id),
                node.id.clone(),
            )
        })?;
        validate_flow_file_composition(
            project_root,
            manifest,
            &target,
            depth + 1,
            stack,
            visiting,
            visited,
        )?;
        let _ = path;
    }
    Ok(())
}

fn validate_inline_subflow(
    project_root: &Path,
    manifest: &FlowManifest,
    owner_subflows: &BTreeMap<String, SubflowBundle>,
    subflow_id: &str,
    depth: usize,
    stack: &mut Vec<String>,
    visiting: &mut HashSet<String>,
    visited: &mut HashSet<String>,
    inline_stack: &mut Vec<String>,
) -> Result<(), ValidationError> {
    if depth > MAX_RUN_FLOW_DEPTH {
        return Err(ValidationError::RunFlowDepthExceeded(MAX_RUN_FLOW_DEPTH));
    }
    if inline_stack.iter().any(|s| s == subflow_id) {
        let cycle = format!(
            "embedded subflow cycle: {} -> {}",
            inline_stack.join(" -> "),
            subflow_id
        );
        return Err(ValidationError::RunFlowCycle(cycle));
    }
    let bundle = owner_subflows.get(subflow_id).ok_or_else(|| {
        ValidationError::RunFlowTargetNotFound(
            format!("embedded subflow `{subflow_id}`"),
            subflow_id.into(),
        )
    })?;
    validate_graph(&bundle.as_graph()).map_err(|e| {
        ValidationError::RunFlowTargetNotFound(
            format!("embedded subflow `{subflow_id}`: {e}"),
            subflow_id.into(),
        )
    })?;
    let graph = bundle.as_graph_with_subflows(Some(owner_subflows));
    inline_stack.push(subflow_id.to_string());
    walk_run_flow_targets(
        project_root,
        manifest,
        &graph,
        Some(owner_subflows),
        depth,
        stack,
        visiting,
        visited,
        inline_stack,
    )?;
    inline_stack.pop();
    Ok(())
}

fn read_json_value(path: &Path) -> Result<Value> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&text).with_context(|| format!("json decode {}", path.display()))
}

pub fn load_flow_cached(
    cache: &mut HashMap<String, LoadedFlowFile>,
    path: &Path,
) -> Result<LoadedFlowFile> {
    let key = normalize_key(path);
    if let Some(hit) = cache.get(&key) {
        return Ok(hit.clone());
    }
    let loaded = load_flow_file(path)?;
    cache.insert(key, loaded.clone());
    Ok(loaded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::load_project;

    #[test]
    fn flow_compose_demo_validates() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/flow-compose-demo");
        let project = load_project(&path).expect("load");
        validate_project_composition(path.as_path(), &project).expect("composition valid");
    }

    #[test]
    fn resolve_project_flow_path_rejects_traversal() {
        let root = std::env::temp_dir().join("hoblio-path-guard");
        let outside_dir = std::env::temp_dir().join("hoblio-outside-proj");
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside_dir);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside_dir).unwrap();
        std::fs::write(root.join("flow.json"), r#"{"start":"start","nodes":[],"edges":[]}"#).unwrap();
        std::fs::write(
            outside_dir.join("evil.json"),
            r#"{"start":"start","nodes":[],"edges":[]}"#,
        )
        .unwrap();
        assert!(resolve_project_flow_path(&root, "../hoblio-outside-proj/evil.json").is_err());
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }
}
