use serde::{Deserialize, Serialize};

use crate::action::{ActionKind, NodeKind};

pub type NodeId = String;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowGraph {
    /// Id of the start node (must have `NodeKind::Start`).
    pub start: NodeId,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Node {
    pub id: NodeId,
    pub kind: NodeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<ActionKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui: Option<NodeUi>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NodeUi {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Edge {
    pub from: NodeId,
    pub to: NodeId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}
