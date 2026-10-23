//! Load and save Hoblio project folders (`manifest.json`, `flow.json`, optional `assets/`).

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use hoblio_model::{FlowGraph, FlowManifest, FlowProject, ProjectVariables, validate_graph};
use serde_json::Value;

pub const MANIFEST_FILE: &str = "manifest.json";
pub const FLOW_FILE: &str = "flow.json";
pub const ASSETS_DIR: &str = "assets";

#[derive(Debug, Clone)]
pub struct ProjectLayout {
    pub root: PathBuf,
    pub manifest_path: PathBuf,
    pub flow_path: PathBuf,
    pub assets_dir: PathBuf,
}

impl ProjectLayout {
    pub fn new(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref().to_path_buf();
        Self {
            manifest_path: root.join(MANIFEST_FILE),
            flow_path: root.join(FLOW_FILE),
            assets_dir: root.join(ASSETS_DIR),
            root,
        }
    }
}

pub fn load_project(dir: impl AsRef<Path>) -> Result<FlowProject> {
    let layout = ProjectLayout::new(dir.as_ref());
    if !layout.root.is_dir() {
        bail!("project path is not a directory: {}", layout.root.display());
    }
    if !layout.manifest_path.is_file() {
        bail!("missing {} in {}", MANIFEST_FILE, layout.root.display());
    }
    if !layout.flow_path.is_file() {
        bail!("missing {} in {}", FLOW_FILE, layout.root.display());
    }

    let manifest: FlowManifest = read_json(&layout.manifest_path).with_context(|| {
        format!("parse {}", layout.manifest_path.display())
    })?;
    let flow_doc: Value = read_json(&layout.flow_path)
        .with_context(|| format!("parse {}", layout.flow_path.display()))?;

    let flow: FlowGraph = serde_json::from_value(flow_doc.clone()).with_context(|| {
        format!("invalid flow schema in {}", layout.flow_path.display())
    })?;

    let variables = flow_doc
        .get("variables")
        .cloned()
        .map(|v| serde_json::from_value(v))
        .transpose()
        .with_context(|| "invalid `variables` in flow.json")?
        .unwrap_or_default();

    Ok(FlowProject {
        manifest,
        flow,
        variables,
    })
}

pub fn save_project(dir: impl AsRef<Path>, project: &FlowProject) -> Result<()> {
    let layout = ProjectLayout::new(dir);
    fs::create_dir_all(&layout.root).with_context(|| {
        format!("create project dir {}", layout.root.display())
    })?;

    write_json_pretty(&layout.manifest_path, &project.manifest)?;
    write_flow(&layout.flow_path, &project.flow, &project.variables)?;
    Ok(())
}

fn write_flow(path: &Path, flow: &FlowGraph, variables: &ProjectVariables) -> Result<()> {
    let mut value = serde_json::to_value(flow).context("serialize flow")?;
    if let Value::Object(ref mut map) = value {
        if !variables.is_empty() {
            map.insert(
                "variables".into(),
                serde_json::to_value(variables).context("serialize variables")?,
            );
        }
    }
    write_json_pretty(path, &value)
}

pub fn validate_project_dir(dir: impl AsRef<Path>) -> Result<()> {
    let project = load_project(dir)?;
    validate_graph(&project.flow).map_err(|e| anyhow::anyhow!(e))
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let text = fs::read_to_string(path)
        .with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&text).with_context(|| format!("json decode {}", path.display()))
}

fn write_json_pretty(path: &Path, value: &impl serde::Serialize) -> Result<()> {
    let text = serde_json::to_string_pretty(value).context("json encode")?;
    fs::write(path, text).with_context(|| format!("write {}", path.display()))
}
