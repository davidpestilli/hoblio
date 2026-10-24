use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result, bail};
use hoblio_log::runtime_event;
use hoblio_model::{
    ControlKind, EdgePort, FlowProject, NodeKind, validate_project,
};

use crate::actions::execute_action;
use crate::cancel::{reset_run_cancel, run_cancel_requested};
use crate::browser::BrowserContext;
use crate::events::{RunEvent, RunOutcome};
use crate::expr::{eval_if, list_from_vars};
use crate::variables::seed_from_project;

type RouteKey = (String, EdgePort);

const MAX_NODE_VISITS: usize = 10_000;

struct LoopFrame {
    for_each_id: String,
    items: Vec<String>,
    index: usize,
    item_var: String,
}

pub fn run_project(project: &FlowProject) -> Result<RunOutcome> {
    run_project_with_listener(project, None, |_| {})
}

pub fn run_project_with_listener<F>(
    project: &FlowProject,
    project_root: Option<&Path>,
    mut on_event: F,
) -> Result<RunOutcome>
where
    F: FnMut(RunEvent),
{
    validate_project(project).map_err(|e| anyhow::anyhow!(e))?;
    reset_run_cancel();

    let mut browser = BrowserContext::new()?;
    let run_result = run_project_inner(project, project_root, &browser, &mut on_event);
    browser.shutdown();
    run_result
}

fn build_routes(edges: &[hoblio_model::Edge]) -> HashMap<RouteKey, String> {
    let mut map = HashMap::new();
    for edge in edges {
        let port = edge.resolved_port();
        map.insert((edge.from.clone(), port), edge.to.clone());
    }
    map
}

fn route_to(routes: &HashMap<RouteKey, String>, from: &str, port: EdgePort) -> Result<String> {
    routes
        .get(&(from.to_string(), port))
        .cloned()
        .with_context(|| format!("node `{from}` has no `{port}` outgoing edge", port = port.as_str()))
}

fn run_project_inner<F>(
    project: &FlowProject,
    project_root: Option<&Path>,
    browser: &BrowserContext,
    on_event: &mut F,
) -> Result<RunOutcome>
where
    F: FnMut(RunEvent),
{
    let mut events = vec![RunEvent::RunStarted {
        project: project.manifest.name.clone(),
    }];
    on_event(RunEvent::RunStarted {
        project: project.manifest.name.clone(),
    });
    runtime_event("run_started", "", &project.manifest.name);

    let nodes: HashMap<_, _> = project
        .flow
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n))
        .collect();

    let routes = build_routes(&project.flow.edges);
    let mut run_vars = seed_from_project(&project.variables);
    let mut loop_frames: Vec<LoopFrame> = Vec::new();

    let mut current = project.flow.start.clone();
    let mut visits = 0usize;

    loop {
        if run_cancel_requested() {
            bail!("run cancelled by user");
        }

        visits += 1;
        if visits > MAX_NODE_VISITS {
            bail!(
                "execution exceeded {MAX_NODE_VISITS} node visits (possible infinite loop)"
            );
        }

        let node = nodes
            .get(current.as_str())
            .with_context(|| format!("node `{current}` missing"))?;

        let enter = RunEvent::NodeEnter {
            node_id: node.id.clone(),
        };
        events.push(enter.clone());
        on_event(enter);
        runtime_event("node_enter", &node.id, node.label.as_deref().unwrap_or(""));

        let mut routed: Option<String> = None;

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
                let summary =
                    execute_action(action, browser, &mut run_vars, project_root)?;
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary,
                };
                events.push(executed.clone());
                on_event(executed);
            }
            NodeKind::If => {
                let control = node.control.as_ref().context("if node without control")?;
                let ControlKind::If(cfg) = control else {
                    bail!("if node has wrong control kind");
                };
                let pass = eval_if(cfg, &run_vars)?;
                let port = if pass { EdgePort::Then } else { EdgePort::Else };
                let summary = format!(
                    "if {} {} {} => {}",
                    cfg.left,
                    match cfg.operator {
                        hoblio_model::CompareOperator::Eq => "==",
                        hoblio_model::CompareOperator::Ne => "!=",
                        hoblio_model::CompareOperator::Contains => "contains",
                    },
                    cfg.right,
                    port.as_str()
                );
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary,
                };
                events.push(executed.clone());
                on_event(executed);
                routed = Some(route_to(&routes, &node.id, port)?);
            }
            NodeKind::ForEach => {
                let control = node
                    .control
                    .as_ref()
                    .context("for_each node without control")?;
                let ControlKind::ForEach(cfg) = control else {
                    bail!("for_each node has wrong control kind");
                };

                let returning = loop_frames
                    .iter()
                    .rposition(|f| f.for_each_id == node.id);

                let port = if let Some(pos) = returning {
                    let frame = &mut loop_frames[pos];
                    frame.index += 1;
                    if frame.index >= frame.items.len() {
                        let item_var = frame.item_var.clone();
                        loop_frames.remove(pos);
                        let _ = item_var;
                        EdgePort::After
                    } else {
                        run_vars.insert(
                            frame.item_var.clone(),
                            frame.items[frame.index].clone(),
                        );
                        EdgePort::Body
                    }
                } else {
                    let items = list_from_vars(&cfg.list_variable, &run_vars)?;
                    if items.is_empty() {
                        EdgePort::After
                    } else {
                        run_vars.insert(cfg.item_variable.clone(), items[0].clone());
                        loop_frames.push(LoopFrame {
                            for_each_id: node.id.clone(),
                            items,
                            index: 0,
                            item_var: cfg.item_variable.clone(),
                        });
                        EdgePort::Body
                    }
                };

                let summary = format!(
                    "for_each `{}` -> port {}",
                    cfg.list_variable,
                    port.as_str()
                );
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary,
                };
                events.push(executed.clone());
                on_event(executed);
                routed = Some(route_to(&routes, &node.id, port)?);
            }
            NodeKind::NextLoop => {
                let frame = loop_frames
                    .last_mut()
                    .context("next_loop outside for_each")?;
                frame.index += 1;
                if frame.index >= frame.items.len() {
                    let for_each_id = frame.for_each_id.clone();
                    loop_frames.pop();
                    routed = Some(route_to(&routes, &for_each_id, EdgePort::After)?);
                } else {
                    run_vars.insert(
                        frame.item_var.clone(),
                        frame.items[frame.index].clone(),
                    );
                    let for_each_id = frame.for_each_id.clone();
                    routed = Some(route_to(&routes, &for_each_id, EdgePort::Body)?);
                }
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary: "next_loop".into(),
                };
                events.push(executed.clone());
                on_event(executed);
            }
            NodeKind::ExitLoop => {
                let frame = loop_frames
                    .pop()
                    .context("exit_loop outside for_each")?;
                routed = Some(route_to(&routes, &frame.for_each_id, EdgePort::After)?);
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary: "exit_loop".into(),
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

        current = if let Some(next) = routed {
            next
        } else {
            match route_to(&routes, &current, EdgePort::Main) {
                Ok(next) => next,
                Err(_) if node.kind == NodeKind::End => unreachable!(),
                Err(e) => return Err(e),
            }
        };
    }
}

#[cfg(test)]
mod tests {
    use hoblio_serde::load_project;

    use super::*;

    #[test]
    fn flow_control_demo_runs() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../examples/flow-control-demo");
        let project = load_project(&path).expect("demo project");
        let outcome = run_project_with_listener(&project, Some(path.as_path()), |_| {})
            .expect("run");
        assert_eq!(outcome.last_node_id, "end");
        let logs: Vec<_> = outcome
            .events
            .iter()
            .filter_map(|e| {
                if let RunEvent::ActionExecuted { summary, .. } = e {
                    Some(summary.as_str())
                } else {
                    None
                }
            })
            .collect();
        assert!(logs.iter().any(|s| s.contains("branch then")));
        assert!(logs.iter().any(|s| s.contains("item=beta")));
    }
}
