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
}

/// Minimal variable schema: string keys → JSON values (expanded in MVP).
pub type ProjectVariables = BTreeMap<String, Value>;
