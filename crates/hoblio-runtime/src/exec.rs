use std::collections::HashMap;

use anyhow::{Context, Result, bail};
use hoblio_log::runtime_event;
use hoblio_model::{ActionKind, FlowProject, NodeKind, validate_graph};

use crate::events::{RunEvent, RunOutcome};

pub fn run_project(project: &FlowProject) -> Result<RunOutcome> {
    validate_graph(&project.flow).map_err(|e| anyhow::anyhow!(e))?;

    let mut events = vec![RunEvent::RunStarted {
        project: project.manifest.name.clone(),
    }];
    runtime_event("run_started", "", &project.manifest.name);

    let nodes: HashMap<_, _> = project
        .flow
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n))
        .collect();

    let mut next_by_from: HashMap<&str, &str> = HashMap::new();
    for edge in &project.flow.edges {
        if next_by_from.insert(edge.from.as_str(), edge.to.as_str()).is_some() {
            bail!(
                "node `{}` has multiple outgoing edges; Phase 0 expects a linear chain",
                edge.from
            );
        }
    }

    let mut current = project.flow.start.as_str();
    loop {
        let node = nodes
            .get(current)
            .with_context(|| format!("node `{current}` missing"))?;

        events.push(RunEvent::NodeEnter {
            node_id: node.id.clone(),
        });
        runtime_event("node_enter", &node.id, node.label.as_deref().unwrap_or(""));

        match node.kind {
            NodeKind::Start => {}
            NodeKind::End => {
                events.push(RunEvent::NodeExit {
                    node_id: node.id.clone(),
                });
                events.push(RunEvent::RunFinished {
                    last_node: node.id.clone(),
                });
                runtime_event("run_finished", &node.id, "end");
                return Ok(RunOutcome {
                    events,
                    last_node_id: node.id.clone(),
                });
            }
            NodeKind::Action => {
                let action = node
                    .action
                    .as_ref()
                    .context("action node without action")?;
                let summary = execute_action(action)?;
                events.push(RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary,
                });
            }
        }

        events.push(RunEvent::NodeExit {
            node_id: node.id.clone(),
        });

        match next_by_from.get(current) {
            Some(next) => current = next,
            None if node.kind == NodeKind::End => unreachable!(),
            None => bail!("node `{}` has no outgoing edge", node.id),
        }
    }
}

fn execute_action(action: &ActionKind) -> Result<String> {
    match action {
        ActionKind::Log(log) => {
            println!("{}", log.message);
            Ok(format!("log: {}", log.message))
        }
        ActionKind::NoOp => Ok("noop".into()),
        ActionKind::BrowserNavigate { url } => {
            bail!("BrowserNavigate not implemented in Phase 0 (url={url})")
        }
        ActionKind::FileWrite { path, .. } => {
            bail!("FileWrite not implemented in Phase 0 (path={path})")
        }
        ActionKind::HttpGet { url } => bail!("HttpGet not implemented in Phase 0 (url={url})"),
    }
}
