use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::flow::{Edge, Node, NodeId};
use crate::project::ProjectVariables;

/// Embedded subflow (FUNCTION-style) inside a flow file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubflowBundle {
    pub start: NodeId,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    #[serde(default)]
    pub variables: ProjectVariables,
}

impl SubflowBundle {
    pub fn as_graph(&self) -> crate::flow::FlowGraph {
        self.as_graph_with_subflows(None)
    }

    /// When `file_subflows` is set, sibling embedded subflows are visible to `run_flow` resolution.
    pub fn as_graph_with_subflows(
        &self,
        file_subflows: Option<&BTreeMap<String, SubflowBundle>>,
    ) -> crate::flow::FlowGraph {
        crate::flow::FlowGraph {
            start: self.start.clone(),
            nodes: self.nodes.clone(),
            edges: self.edges.clone(),
            subflows: file_subflows.cloned(),
        }
    }
}
