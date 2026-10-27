use std::collections::{HashMap, HashSet};

use thiserror::Error;

use crate::action::{ActionKind, NodeKind};
use crate::control::EdgePort;
use crate::control::ControlKind;
use crate::flow::{FlowGraph, NodeId};
use crate::project::FlowProject;

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
    #[error("control node `{0}` has no control config")]
    ControlNodeMissingControl(NodeId),
    #[error("node `{0}` has action but is not an action node")]
    NonActionHasAction(NodeId),
    #[error("node `{0}` has control but is not a control node")]
    NonControlHasControl(NodeId),
    #[error("start node `{0}` must not have an action")]
    StartHasAction(NodeId),
    #[error("end node `{0}` must not have outgoing edges")]
    EndHasOutgoing(NodeId),
    #[error("node `{0}` is unreachable from start")]
    Unreachable(NodeId),
    #[error("graph has no End node")]
    MissingEnd,
    #[error("node `{0}` has duplicate outgoing port `{1}`")]
    DuplicateOutgoingPort(NodeId, String),
    #[error("node `{0}` is missing required outgoing port `{1}`")]
    MissingOutgoingPort(NodeId, String),
    #[error("node `{0}` must not use port `{1}`")]
    InvalidPortForNode(NodeId, String),
    #[error("cycle detected without a loop node (for_each / while_loop / repeat) (nodes: {0})")]
    CycleWithoutForEach(String),
    #[error("node `{0}` must be inside the body of a loop (for_each, while_loop, or repeat)")]
    LoopControlOutsideForEach(NodeId),
    #[error("for_each node `{0}` has invalid list variable name `{1}`")]
    InvalidListVariable(NodeId, String),
    #[error("node `{0}` uses invalid variable name `{1}`")]
    InvalidVariableName(NodeId, String),
    #[error("variable `{0}` is produced by both `{1}` and `{2}`")]
    DuplicateVariableProducer(String, NodeId, NodeId),
    #[error("node `{0}` set_variable requires a non-empty variable name")]
    SetVariableNameMissing(NodeId),
    #[error("node `{0}` retry_count {1} exceeds maximum allowed")]
    InvalidRetryCount(NodeId, u32),
    #[error("node `{0}` run_flow requires flow_id or path")]
    RunFlowMissingTarget(NodeId),
    #[error("run_flow composition cycle: {0}")]
    RunFlowCycle(String),
    #[error("run_flow composition exceeds maximum depth {0}")]
    RunFlowDepthExceeded(usize),
    #[error("run_flow target `{0}` not found for node `{1}`")]
    RunFlowTargetNotFound(String, NodeId),
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
    if start.action.is_some() || start.control.is_some() {
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
            NodeKind::If
            | NodeKind::ForEach
            | NodeKind::WhileLoop
            | NodeKind::Repeat
                if node.control.is_none() =>
            {
                return Err(ValidationError::ControlNodeMissingControl(node.id.clone()));
            }
            NodeKind::NextLoop | NodeKind::ExitLoop => {}
            _ => {}
        }
        if node.action.is_some() && node.kind != NodeKind::Action {
            return Err(ValidationError::NonActionHasAction(node.id.clone()));
        }
        if node.control.is_some()
            && !matches!(
                node.kind,
                NodeKind::If | NodeKind::ForEach | NodeKind::WhileLoop | NodeKind::Repeat
            )
        {
            return Err(ValidationError::NonControlHasControl(node.id.clone()));
        }
    }
    if !has_end {
        return Err(ValidationError::MissingEnd);
    }

    let mut outgoing: HashMap<String, Vec<(EdgePort, String)>> = HashMap::new();
    for edge in &graph.edges {
        if !by_id.contains_key(&edge.from) {
            return Err(ValidationError::UnknownNode(edge.from.clone()));
        }
        if !by_id.contains_key(&edge.to) {
            return Err(ValidationError::UnknownNode(edge.to.clone()));
        }
        let from_node = by_id[&edge.from];
        let port = edge.resolved_port();
        if !port_allowed(from_node.kind, port) {
            return Err(ValidationError::InvalidPortForNode(
                edge.from.clone(),
                port.as_str().into(),
            ));
        }
        outgoing
            .entry(edge.from.clone())
            .or_default()
            .push((port, edge.to.clone()));
    }

    for (node_id, edges) in &outgoing {
        let mut seen = HashSet::new();
        for (port, _) in edges {
            if !seen.insert(*port) {
                return Err(ValidationError::DuplicateOutgoingPort(
                    node_id.clone(),
                    port.as_str().into(),
                ));
            }
        }
    }

    for node in &graph.nodes {
        if node.kind == NodeKind::End && outgoing.contains_key(&node.id) {
            return Err(ValidationError::EndHasOutgoing(node.id.clone()));
        }
        if let Some(err) = validate_required_ports(node, outgoing.get(&node.id)) {
            return Err(err);
        }
    }

    let reachable = reachable_from(&graph.start, &outgoing);
    for node in &graph.nodes {
        if !reachable.contains(&node.id) {
            return Err(ValidationError::Unreachable(node.id.clone()));
        }
    }

    if let Some(ids) = cycle_without_for_each(graph, &by_id) {
        return Err(ValidationError::CycleWithoutForEach(ids));
    }

    if let Some(subflows) = &graph.subflows {
        for (name, bundle) in subflows {
            if !is_valid_variable_name(name) {
                return Err(ValidationError::RunFlowTargetNotFound(
                    format!("invalid embedded subflow id `{name}`"),
                    name.clone(),
                ));
            }
            validate_graph(&bundle.as_graph()).map_err(|e| {
                ValidationError::RunFlowTargetNotFound(
                    format!("subflow `{name}`: {e}"),
                    name.clone(),
                )
            })?;
        }
    }

    Ok(())
}

pub fn validate_project(project: &FlowProject) -> Result<(), ValidationError> {
    validate_graph(&project.flow)?;
    validate_for_each_list_names(&project.flow)?;
    validate_loop_controls(&project.flow)?;
    validate_variable_producers(&project.flow)?;
    validate_error_handling(&project.flow)?;
    Ok(())
}

const MAX_ACTION_RETRIES: u32 = 50;

fn validate_error_handling(graph: &FlowGraph) -> Result<(), ValidationError> {
    for node in &graph.nodes {
        let Some(policy) = &node.error_handling else {
            continue;
        };
        if policy.retry_count > MAX_ACTION_RETRIES {
            return Err(ValidationError::InvalidRetryCount(
                node.id.clone(),
                policy.retry_count,
            ));
        }
    }
    Ok(())
}

fn is_valid_variable_name(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn validate_variable_producers(graph: &FlowGraph) -> Result<(), ValidationError> {
    let mut producers: HashMap<String, NodeId> = HashMap::new();

    for node in &graph.nodes {
        if let Some(action) = &node.action {
            if matches!(action, ActionKind::SetVariable { variable, .. } if variable.trim().is_empty())
            {
                return Err(ValidationError::SetVariableNameMissing(node.id.clone()));
            }
            if matches!(action, ActionKind::FileRead { variable, .. } if variable.trim().is_empty())
            {
                return Err(ValidationError::SetVariableNameMissing(node.id.clone()));
            }
            if matches!(
                action,
                ActionKind::ShowGetUserInput {
                    user_input_variable,
                    button_pressed_variable,
                    ..
                } if user_input_variable.trim().is_empty() || button_pressed_variable.trim().is_empty()
            ) {
                return Err(ValidationError::SetVariableNameMissing(node.id.clone()));
            }
            if matches!(
                action,
                ActionKind::ListAppend { list_variable, .. }
                    | ActionKind::ListClear { list_variable }
                    if list_variable.trim().is_empty()
            ) {
                return Err(ValidationError::InvalidListVariable(
                    node.id.clone(),
                    String::new(),
                ));
            }
            if matches!(action, ActionKind::RunFlow { flow_id, path, .. }
                if flow_id.as_deref().unwrap_or("").is_empty()
                    && path.as_deref().unwrap_or("").is_empty())
            {
                return Err(ValidationError::RunFlowMissingTarget(node.id.clone()));
            }
            for name in action.produced_variables() {
                if !is_valid_variable_name(name) {
                    return Err(ValidationError::InvalidVariableName(
                        node.id.clone(),
                        name.to_string(),
                    ));
                }
                if let Some(prev) = producers.get(name) {
                    return Err(ValidationError::DuplicateVariableProducer(
                        name.to_string(),
                        prev.clone(),
                        node.id.clone(),
                    ));
                }
                producers.insert(name.to_string(), node.id.clone());
            }
        }

        if node.kind == NodeKind::ForEach {
            let Some(ControlKind::ForEach(cfg)) = &node.control else {
                continue;
            };
            let name = cfg.item_variable.trim();
            if name.is_empty() || !is_valid_variable_name(name) {
                return Err(ValidationError::InvalidVariableName(
                    node.id.clone(),
                    cfg.item_variable.clone(),
                ));
            }
            if let Some(prev) = producers.get(name) {
                return Err(ValidationError::DuplicateVariableProducer(
                    name.to_string(),
                    prev.clone(),
                    node.id.clone(),
                ));
            }
            producers.insert(name.to_string(), node.id.clone());
        }
        if node.kind == NodeKind::Repeat {
            let Some(ControlKind::Repeat(cfg)) = &node.control else {
                continue;
            };
            let name = cfg.index_variable.trim();
            if name.is_empty() || !is_valid_variable_name(name) {
                return Err(ValidationError::InvalidVariableName(
                    node.id.clone(),
                    cfg.index_variable.clone(),
                ));
            }
            if let Some(prev) = producers.get(name) {
                return Err(ValidationError::DuplicateVariableProducer(
                    name.to_string(),
                    prev.clone(),
                    node.id.clone(),
                ));
            }
            producers.insert(name.to_string(), node.id.clone());
        }
    }

    Ok(())
}

fn validate_for_each_list_names(graph: &FlowGraph) -> Result<(), ValidationError> {
    for node in &graph.nodes {
        if node.kind != NodeKind::ForEach {
            continue;
        }
        let Some(ControlKind::ForEach(cfg)) = &node.control else {
            continue;
        };
        let name = cfg.list_variable.trim();
        if name.is_empty() || !is_valid_variable_name(name) {
            return Err(ValidationError::InvalidListVariable(
                node.id.clone(),
                cfg.list_variable.clone(),
            ));
        }
    }
    Ok(())
}

fn validate_loop_controls(graph: &FlowGraph) -> Result<(), ValidationError> {
    let mut outgoing: HashMap<String, Vec<(EdgePort, String)>> = HashMap::new();
    for edge in &graph.edges {
        outgoing
            .entry(edge.from.clone())
            .or_default()
            .push((edge.resolved_port(), edge.to.clone()));
    }

    let mut body_union = HashSet::new();
    for node in &graph.nodes {
        if matches!(
            node.kind,
            NodeKind::ForEach | NodeKind::WhileLoop | NodeKind::Repeat
        ) {
            body_union.extend(loop_body_nodes(&node.id, &outgoing));
        }
    }

    for node in &graph.nodes {
        if matches!(node.kind, NodeKind::NextLoop | NodeKind::ExitLoop)
            && !body_union.contains(&node.id)
        {
            return Err(ValidationError::LoopControlOutsideForEach(node.id.clone()));
        }
    }
    Ok(())
}

fn loop_body_nodes(
    loop_id: &str,
    outgoing: &HashMap<String, Vec<(EdgePort, String)>>,
) -> HashSet<String> {
    let Some(body_start) = outgoing.get(loop_id).and_then(|edges| {
        edges
            .iter()
            .find(|(port, _)| *port == EdgePort::Body)
            .map(|(_, to)| to.clone())
    }) else {
        return HashSet::new();
    };

    let mut seen = HashSet::new();
    let mut stack = vec![body_start];
    while let Some(id) = stack.pop() {
        if !seen.insert(id.clone()) {
            continue;
        }
        if id == loop_id {
            continue;
        }
        let Some(edges) = outgoing.get(&id) else {
            continue;
        };
        for (port, to) in edges {
            if id == loop_id && *port == EdgePort::After {
                continue;
            }
            stack.push(to.clone());
        }
    }
    seen
}

/// Strongly connected components with >1 node, or self-loops, must include a `for_each`.
fn cycle_without_for_each(
    graph: &FlowGraph,
    by_id: &HashMap<&NodeId, &crate::flow::Node>,
) -> Option<String> {
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    for edge in &graph.edges {
        adj.entry(edge.from.clone())
            .or_default()
            .push(edge.to.clone());
        if edge.from == edge.to {
            let node = by_id.get(&edge.from).copied()?;
            if !is_loop_header(node.kind) {
                return Some(edge.from.clone());
            }
        }
    }

    let mut index = 0usize;
    let mut stack = Vec::new();
    let mut on_stack = HashSet::new();
    let mut indices = HashMap::new();
    let mut lowlink = HashMap::new();
    let mut scc_nodes: Vec<Vec<String>> = Vec::new();

    fn strong_connect(
        v: &str,
        adj: &HashMap<String, Vec<String>>,
        index: &mut usize,
        stack: &mut Vec<String>,
        on_stack: &mut HashSet<String>,
        indices: &mut HashMap<String, usize>,
        lowlink: &mut HashMap<String, usize>,
        scc_nodes: &mut Vec<Vec<String>>,
    ) {
        indices.insert(v.to_string(), *index);
        lowlink.insert(v.to_string(), *index);
        *index += 1;
        stack.push(v.to_string());
        on_stack.insert(v.to_string());

        if let Some(nexts) = adj.get(v) {
            for w in nexts {
                if !indices.contains_key(w) {
                    strong_connect(
                        w, adj, index, stack, on_stack, indices, lowlink, scc_nodes,
                    );
                    let lw = *lowlink.get(w).unwrap();
                    let lv = lowlink.get_mut(v).unwrap();
                    if lw < *lv {
                        *lv = lw;
                    }
                } else if on_stack.contains(w) {
                    let lw = *indices.get(w).unwrap();
                    let lv = lowlink.get_mut(v).unwrap();
                    if lw < *lv {
                        *lv = lw;
                    }
                }
            }
        }

        if lowlink.get(v) == indices.get(v) {
            let mut component = Vec::new();
            loop {
                let w = stack.pop().unwrap();
                on_stack.remove(&w);
                component.push(w.clone());
                if w == v {
                    break;
                }
            }
            scc_nodes.push(component);
        }
    }

    for node in &graph.nodes {
        if !indices.contains_key(&node.id) {
            strong_connect(
                &node.id,
                &adj,
                &mut index,
                &mut stack,
                &mut on_stack,
                &mut indices,
                &mut lowlink,
                &mut scc_nodes,
            );
        }
    }

    for component in scc_nodes {
        if component.len() <= 1 {
            continue;
        }
        let has_loop = component.iter().any(|id| {
            by_id
                .get(id)
                .map(|n| is_loop_header(n.kind))
                .unwrap_or(false)
        });
        if !has_loop {
            return Some(component.join(", "));
        }
    }
    None
}

fn is_loop_header(kind: NodeKind) -> bool {
    matches!(
        kind,
        NodeKind::ForEach | NodeKind::WhileLoop | NodeKind::Repeat
    )
}

fn port_allowed(kind: NodeKind, port: EdgePort) -> bool {
    match kind {
        NodeKind::Start | NodeKind::Action | NodeKind::NextLoop | NodeKind::ExitLoop => {
            port == EdgePort::Main
        }
        NodeKind::End => false,
        NodeKind::If => matches!(port, EdgePort::Then | EdgePort::Else),
        NodeKind::ForEach | NodeKind::WhileLoop | NodeKind::Repeat => {
            matches!(port, EdgePort::Body | EdgePort::After)
        }
    }
}

fn validate_required_ports(
    node: &crate::flow::Node,
    edges: Option<&Vec<(EdgePort, String)>>,
) -> Option<ValidationError> {
    let ports: HashSet<EdgePort> = edges
        .map(|e| e.iter().map(|(p, _)| *p).collect())
        .unwrap_or_default();
    let need = match node.kind {
        NodeKind::If => [EdgePort::Then, EdgePort::Else],
        NodeKind::ForEach | NodeKind::WhileLoop | NodeKind::Repeat => {
            [EdgePort::Body, EdgePort::After]
        }
        _ => return None,
    };
    for port in need {
        if !ports.contains(&port) {
            return Some(ValidationError::MissingOutgoingPort(
                node.id.clone(),
                port.as_str().into(),
            ));
        }
    }
    None
}

fn reachable_from(start: &NodeId, outgoing: &HashMap<String, Vec<(EdgePort, String)>>) -> HashSet<String> {
    let mut seen = HashSet::new();
    let mut stack = vec![start.clone()];
    while let Some(id) = stack.pop() {
        if !seen.insert(id.clone()) {
            continue;
        }
        if let Some(nexts) = outgoing.get(&id) {
            stack.extend(nexts.iter().map(|(_, to)| to.clone()));
        }
    }
    seen
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action::{ActionKind, LogAction, NodeKind};
    use crate::control::{CompareOperator, ControlKind, IfControl};
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
                    control: None,
                    ui: None,
                    error_handling: None,
                },
                Node {
                    id: "log1".into(),
                    kind: NodeKind::Action,
                    label: Some("Log 1".into()),
                    action: Some(ActionKind::Log(LogAction {
                        message: "a".into(),
                    })),
                    control: None,
                    ui: None,
                    error_handling: None,
                },
                Node {
                    id: "end".into(),
                    kind: NodeKind::End,
                    label: Some("End".into()),
                    action: None,
                    control: None,
                    ui: None,
                    error_handling: None,
                },
            ],
            edges: vec![
                Edge {
                    id: None,
                    from: "start".into(),
                    to: "log1".into(),
                    label: None,
                    port: None,
                    ui: None,
                },
                Edge {
                    id: None,
                    from: "log1".into(),
                    to: "end".into(),
                    label: None,
                    port: None,
                    ui: None,
                },
            ],
            subflows: None,
        }
    }

    #[test]
    fn valid_demo() {
        validate_graph(&demo()).unwrap();
    }

    #[test]
    fn if_requires_then_and_else() {
        let mut g = demo();
        g.nodes.insert(
            2,
            Node {
                id: "cond".into(),
                kind: NodeKind::If,
                label: Some("If".into()),
                action: None,
                control: Some(ControlKind::If(IfControl {
                    left: "flag".into(),
                    operator: CompareOperator::Eq,
                    right: "yes".into(),
                    ignore_case: false,
                })),
                ui: None,
                error_handling: None,
            },
        );
        g.edges = vec![
            Edge {
                id: None,
                from: "start".into(),
                to: "cond".into(),
                label: None,
                port: None,
                ui: None,
            },
            Edge {
                id: None,
                from: "cond".into(),
                to: "log1".into(),
                label: None,
                port: Some("then".into()),
                ui: None,
            },
        ];
        assert!(matches!(
            validate_graph(&g),
            Err(ValidationError::MissingOutgoingPort(id, port))
                if id == "cond" && port == "else"
        ));
    }
}