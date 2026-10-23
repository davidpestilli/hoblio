use std::collections::HashMap;

use anyhow::{Context, Result, bail};
use hoblio_log::runtime_event;
use hoblio_model::{FlowProject, NodeKind, validate_graph};

use crate::actions::execute_action;
use crate::events::{RunEvent, RunOutcome};

pub fn run_project(project: &FlowProject) -> Result<RunOutcome> {
    run_project_with_listener(project, |_| {})
}

pub fn run_project_with_listener<F>(project: &FlowProject, mut on_event: F) -> Result<RunOutcome>
where
    F: FnMut(RunEvent),
{
    validate_graph(&project.flow).map_err(|e| anyhow::anyhow!(e))?;

    let mut events = vec![RunEvent::RunStarted {
        project: project.manifest.name.clone(),
    }];
    let started = RunEvent::RunStarted {
        project: project.manifest.name.clone(),
    };
    on_event(started);
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
                "node `{}` has multiple outgoing edges; MVP expects a linear chain",
                edge.from
            );
        }
    }

    let mut current = project.flow.start.as_str();
    loop {
        let node = nodes
            .get(current)
            .with_context(|| format!("node `{current}` missing"))?;

        let enter = RunEvent::NodeEnter {
            node_id: node.id.clone(),
        };
        events.push(enter.clone());
        on_event(enter);
        runtime_event("node_enter", &node.id, node.label.as_deref().unwrap_or(""));

        match node.kind {
            NodeKind::Start => {}
            NodeKind::End => {
                let exit = RunEvent::NodeExit {
                    node_id: node.id.clone(),
                };
                events.push(exit.clone());
                on_event(exit);
                let finished = RunEvent::RunFinished {
                    last_node: node.id.clone(),
                };
                events.push(finished.clone());
                on_event(finished);
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
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary,
                };
                events.push(executed.clone());
                on_event(executed);
            }
        }

        let exit = RunEvent::NodeExit {
            node_id: node.id.clone(),
        };
        events.push(exit.clone());
        on_event(exit);

        match next_by_from.get(current) {
            Some(next) => current = next,
            None if node.kind == NodeKind::End => unreachable!(),
            None => bail!("node `{}` has no outgoing edge", node.id),
        }
    }
}
