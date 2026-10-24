use std::collections::{HashMap, HashSet};

use thiserror::Error;

use crate::action::NodeKind;
use crate::flow::{FlowGraph, NodeId};

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ValidationError {
    #[error("start node `{0}` not found in nodes")]
    StartMissing(NodeId),
    #[error("node `{0}` has kind Start but is not the graph start id")]
    WrongStartNode(NodeId),
    #[error("duplicate node id `{0}`")]
    DuplicateNodeId(NodeId),
    #[error("edge references unknown node `{0}`")]
    UnknownNode(NodeId),
    #[error("action node `{0}` has no action")]
    ActionNodeMissingAction(NodeId),
    #[error("start node `{0}` must not have an action")]
    StartHasAction(NodeId),
    #[error("end node `{0}` must not have outgoing edges")]
    EndHasOutgoing(NodeId),
    #[error("node `{0}` is unreachable from start")]
    Unreachable(NodeId),
    #[error("graph has no End node")]
    MissingEnd,
}

pub fn validate_graph(graph: &FlowGraph) -> Result<(), ValidationError> {
    let mut by_id: HashMap<&NodeId, &crate::flow::Node> = HashMap::new();
    for node in &graph.nodes {
        if by_id.insert(&node.id, node).is_some() {
            return Err(ValidationError::DuplicateNodeId(node.id.clone()));
        }
    }

    let start = by_id
        .get(&graph.start)
        .ok_or_else(|| ValidationError::StartMissing(graph.start.clone()))?;

    if start.kind != NodeKind::Start {
        return Err(ValidationError::WrongStartNode(graph.start.clone()));
    }
    if start.action.is_some() {
        return Err(ValidationError::StartHasAction(graph.start.clone()));
    }

    let mut has_end = false;
    for node in &graph.nodes {
        match node.kind {
            NodeKind::Start if node.id != graph.start => {
                return Err(ValidationError::WrongStartNode(node.id.clone()));
            }
            NodeKind::End => has_end = true,
            NodeKind::Action if node.action.is_none() => {
                return Err(ValidationError::ActionNodeMissingAction(node.id.clone()));
            }
            _ => {}
        }
    }
    if !has_end {
        return Err(ValidationError::MissingEnd);
    }

    let mut outgoing: HashMap<String, Vec<String>> = HashMap::new();
    for edge in &graph.edges {
        if !by_id.contains_key(&edge.from) {
            return Err(ValidationError::UnknownNode(edge.from.clone()));
        }
        if !by_id.contains_key(&edge.to) {
            return Err(ValidationError::UnknownNode(edge.to.clone()));
        }
        outgoing
            .entry(edge.from.clone())
            .or_default()
            .push(edge.to.clone());
    }

    for node in &graph.nodes {
        if node.kind == NodeKind::End && outgoing.contains_key(&node.id) {
            return Err(ValidationError::EndHasOutgoing(node.id.clone()));
        }
    }

    let reachable = reachable_from(&graph.start, &outgoing);
    for node in &graph.nodes {
        if !reachable.contains(&node.id) {
            return Err(ValidationError::Unreachable(node.id.clone()));
        }
    }

    Ok(())
}

fn reachable_from(start: &NodeId, outgoing: &HashMap<String, Vec<String>>) -> HashSet<String> {
    let mut seen = HashSet::new();
    let mut stack = vec![start.clone()];
    while let Some(id) = stack.pop() {
        if !seen.insert(id.clone()) {
            continue;
        }
        if let Some(nexts) = outgoing.get(&id) {
            stack.extend(nexts.iter().cloned());
        }
    }
    seen
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action::{ActionKind, LogAction, NodeKind};
    use crate::flow::{Edge, FlowGraph, Node};

    fn demo() -> FlowGraph {
        FlowGraph {
            start: "start".into(),
            nodes: vec![
                Node {
                    id: "start".into(),
                    kind: NodeKind::Start,
                    label: Some("Start".into()),
                    action: None,
                    ui: None,
                },
                Node {
                    id: "log1".into(),
                    kind: NodeKind::Action,
                    label: Some("Log 1".into()),
                    action: Some(ActionKind::Log(LogAction {
                        message: "a".into(),
                    })),
                    ui: None,
                },
                Node {
                    id: "end".into(),
                    kind: NodeKind::End,
                    label: Some("End".into()),
                    action: None,
                    ui: None,
                },
            ],
            edges: vec![
                Edge {
                    id: None,
                    from: "start".into(),
                    to: "log1".into(),
                    label: None,
                    ui: None,
                },
                Edge {
                    id: None,
                    from: "log1".into(),
                    to: "end".into(),
                    label: None,
                    ui: None,
                },
            ],
        }
    }

    #[test]
    fn valid_demo() {
        validate_graph(&demo()).unwrap();
    }
}
