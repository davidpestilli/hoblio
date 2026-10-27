use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::flow::FlowGraph;

/// On-disk project: manifest + flow (+ optional assets handled by hoblio-serde).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowProject {
    pub manifest: FlowManifest,
    pub flow: FlowGraph,
    #[serde(default)]
    pub variables: ProjectVariables,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowManifest {
    pub name: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Primary flow file relative to project root (default: `flow.json`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_flow: Option<String>,
    /// Named child flows for `run_flow` actions (`flow_id` → path + contract).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flows: Option<BTreeMap<String, FlowManifestEntry>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowManifestEntry {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inputs: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outputs: Option<Vec<String>>,
}

/// Minimal variable schema: string keys → JSON values (expanded in MVP).
pub type ProjectVariables = BTreeMap<String, Value>;
