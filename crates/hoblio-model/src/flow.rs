use serde::{Deserialize, Serialize};

use crate::action::{ActionKind, NodeKind};
use crate::control::{ControlKind, EdgePort};

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
    pub control: Option<ControlKind>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub from: NodeId,
    pub to: NodeId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Logical port on the source node (`then`, `else`, `body`, `after`, or `main`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui: Option<EdgeUi>,
}

impl Edge {
    /// Resolved port: explicit `port`, else React Flow `source_handle`, else main.
    pub fn resolved_port(&self) -> EdgePort {
        if let Some(p) = &self.port {
            if let Some(ep) = EdgePort::parse(p) {
                return ep;
            }
        }
        if let Some(ui) = &self.ui {
            if let Some(h) = &ui.source_handle {
                if let Some(ep) = EdgePort::parse(h) {
                    return ep;
                }
            }
        }
        EdgePort::Main
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeUi {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub waypoints: Option<Vec<Waypoint>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_handle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_handle: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Waypoint {
    pub x: f64,
    pub y: f64,
}
