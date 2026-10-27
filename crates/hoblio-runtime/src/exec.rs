use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result, bail};
use hoblio_log::runtime_event;
use hoblio_model::{
    ActionKind, ControlKind, EdgePort, ErrorHandling, FlowGraph, FlowProject, NodeKind,
    RunFlowVariableScope, validate_project,
};
use hoblio_serde::LoadedFlowFile;

use crate::actions::{execute_action, snapshot_action_variables};
use crate::run_flow::{
    apply_inherit_run_flow_inputs, apply_isolated_run_flow_inputs, child_browser_for_action,
    merge_isolated_outputs, prepare_child_flow, run_flow_summary, shutdown_optional_browser,
};
use crate::cancel::{reset_run_cancel, run_cancel_requested};
use crate::browser::BrowserContext;
use crate::events::{RunEvent, RunOutcome};
use crate::expr::{eval_if, list_from_vars, parse_number, resolve_operand};
use crate::variables::{RunVariables, seed_from_project};

type RouteKey = (String, EdgePort);

const MAX_NODE_VISITS: usize = 10_000;

enum LoopFrame {
    ForEach {
        for_each_id: String,
        items: Vec<String>,
        index: usize,
        item_var: String,
    },
    While {
        while_id: String,
    },
    Repeat {
        repeat_id: String,
        times: usize,
        index: usize,
        index_var: String,
    },
}

fn loop_frame_id(frame: &LoopFrame) -> &str {
    match frame {
        LoopFrame::ForEach { for_each_id, .. } => for_each_id,
        LoopFrame::While { while_id } => while_id,
        LoopFrame::Repeat { repeat_id, .. } => repeat_id,
    }
}

fn compare_op_label(op: hoblio_model::CompareOperator) -> &'static str {
    match op {
        hoblio_model::CompareOperator::Eq => "==",
        hoblio_model::CompareOperator::Ne => "!=",
        hoblio_model::CompareOperator::Contains => "contains",
        hoblio_model::CompareOperator::Gt => ">",
        hoblio_model::CompareOperator::Gte => ">=",
        hoblio_model::CompareOperator::Lt => "<",
        hoblio_model::CompareOperator::Lte => "<=",
    }
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
    if let Some(root) = project_root {
        hoblio_serde::validate_project_composition(root, project)
            .map_err(|e| anyhow::anyhow!(e))?;
    }
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

fn execute_action_with_policy(
    action: &hoblio_model::ActionKind,
    policy: Option<&ErrorHandling>,
    browser: &BrowserContext,
    run_vars: &mut crate::variables::RunVariables,
    project_root: Option<&Path>,
) -> Result<String> {
    let policy = policy.cloned().unwrap_or_default();
    let attempts = policy.attempts();
    let delay_ms = policy.retry_delay_ms.unwrap_or(500);

    for attempt in 1..=attempts {
        match execute_action(action, browser, run_vars, project_root) {
            Ok(summary) => return Ok(summary),
            Err(err) if attempt < attempts => {
                runtime_event(
                    "action_retry",
                    "",
                    &format!("attempt {attempt}/{attempts}: {err}"),
                );
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            }
            Err(err) if policy.continues_on_failure() => {
                return Ok(format!("failed (continued): {err:#}"));
            }
            Err(err) => return Err(err),
        }
    }
    unreachable!("attempts >= 1")
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

    let mut run_vars = seed_from_project(&project.variables);
    let mut loop_frames: Vec<LoopFrame> = Vec::new();
    let mut flow_cache: HashMap<String, LoadedFlowFile> = HashMap::new();
    let mut visits = 0usize;

    let root = project_root.unwrap_or_else(|| Path::new("."));

    let last_node = run_graph(
        &project.flow,
        "flow.json",
        0,
        &project.manifest,
        root,
        browser,
        &mut run_vars,
        &mut loop_frames,
        &mut flow_cache,
        &mut visits,
        &mut events,
        on_event,
    )?;

    let finished = RunEvent::RunFinished {
        last_node: last_node.clone(),
    };
    events.push(finished.clone());
    on_event(finished);
    runtime_event("run_finished", &last_node, "end");

    Ok(RunOutcome {
        events,
        last_node_id: last_node,
    })
}

#[allow(clippy::too_many_arguments)]
fn run_graph<F>(
    graph: &FlowGraph,
    flow_ref: &str,
    depth: usize,
    manifest: &hoblio_model::FlowManifest,
    project_root: &Path,
    browser: &BrowserContext,
    run_vars: &mut crate::variables::RunVariables,
    loop_frames: &mut Vec<LoopFrame>,
    flow_cache: &mut HashMap<String, LoadedFlowFile>,
    visits: &mut usize,
    events: &mut Vec<RunEvent>,
    on_event: &mut F,
) -> Result<String>
where
    F: FnMut(RunEvent),
{
    let nodes: HashMap<_, _> = graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let routes = build_routes(&graph.edges);
    let flow_ref_owned = flow_ref.to_string();

    let mut current = graph.start.clone();

    loop {
        if run_cancel_requested() {
            bail!("run cancelled by user");
        }

        *visits += 1;
        if *visits > MAX_NODE_VISITS {
            bail!(
                "execution exceeded {MAX_NODE_VISITS} node visits (possible infinite loop)"
            );
        }

        let node = nodes
            .get(current.as_str())
            .with_context(|| format!("node `{current}` missing"))?;

        let enter = RunEvent::NodeEnter {
            node_id: node.id.clone(),
            flow_ref: Some(flow_ref_owned.clone()),
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
                    flow_ref: Some(flow_ref_owned.clone()),
                };
                events.push(exit.clone());
                on_event(exit);
                return Ok(node.id.clone());
            }
            NodeKind::Action => {
                let action = node
                    .action
                    .as_ref()
                    .context("action node without action")?;
                let summary = if matches!(action, ActionKind::RunFlow { .. }) {
                    let ActionKind::RunFlow {
                        inputs,
                        outputs,
                        variable_scope,
                        ..
                    } = action
                    else {
                        unreachable!()
                    };
                    let scope = variable_scope.unwrap_or(RunFlowVariableScope::Inherit);
                    let resolved =
                        prepare_child_flow(project_root, manifest, graph, action, depth, flow_cache)?;
                    let child_label = match action {
                        ActionKind::RunFlow { flow_id, .. } => flow_id
                            .as_deref()
                            .filter(|s| !s.is_empty())
                            .map(String::from)
                            .unwrap_or_else(|| resolved.label()),
                        _ => resolved.label(),
                    };
                    let optional_browser = child_browser_for_action(action)?;
                    let browser_ref = optional_browser.as_ref().unwrap_or(browser);
                    let started = RunEvent::FlowStarted {
                        flow_ref: child_label.clone(),
                        parent_node_id: Some(node.id.clone()),
                    };
                    events.push(started.clone());
                    on_event(started);
                    let end_node = match scope {
                        RunFlowVariableScope::Inherit => {
                            apply_inherit_run_flow_inputs(
                                inputs.as_ref(),
                                resolved.variables(),
                                run_vars,
                            )?;
                            run_graph(
                                resolved.graph(),
                                &child_label,
                                depth + 1,
                                manifest,
                                project_root,
                                browser_ref,
                                run_vars,
                                loop_frames,
                                flow_cache,
                                visits,
                                events,
                                on_event,
                            )?
                        }
                        RunFlowVariableScope::Isolated => {
                            let parent_snapshot = run_vars.clone();
                            let mut child_vars = RunVariables::new();
                            apply_isolated_run_flow_inputs(
                                inputs.as_ref(),
                                resolved.variables(),
                                run_vars,
                                &mut child_vars,
                            )?;
                            let end = run_graph(
                                resolved.graph(),
                                &child_label,
                                depth + 1,
                                manifest,
                                project_root,
                                browser_ref,
                                &mut child_vars,
                                loop_frames,
                                flow_cache,
                                visits,
                                events,
                                on_event,
                            )?;
                            merge_isolated_outputs(
                                run_vars,
                                parent_snapshot,
                                &child_vars,
                                outputs.as_ref(),
                            );
                            end
                        }
                    };
                    shutdown_optional_browser(optional_browser);
                    let finished = RunEvent::FlowFinished {
                        flow_ref: child_label.clone(),
                        end_node_id: end_node.clone(),
                    };
                    events.push(finished.clone());
                    on_event(finished);
                    run_flow_summary(&child_label, &end_node, outputs.as_ref(), run_vars)
                } else {
                    execute_action_with_policy(
                        action,
                        node.error_handling.as_ref(),
                        browser,
                        run_vars,
                        Some(project_root),
                    )?
                };
                let variables = snapshot_action_variables(action, run_vars);
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary: summary.clone(),
                    variables,
                };
                runtime_event("action_executed", &node.id, &summary);
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
                    compare_op_label(cfg.operator),
                    cfg.right,
                    port.as_str()
                );
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary,
                    variables: None,
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

                let returning = loop_frames.iter().rposition(|f| {
                    matches!(
                        f,
                        LoopFrame::ForEach { for_each_id, .. } if for_each_id == &node.id
                    )
                });

                let port = if let Some(pos) = returning {
                    let frame = &mut loop_frames[pos];
                    let LoopFrame::ForEach {
                        items,
                        index,
                        item_var,
                        ..
                    } = frame
                    else {
                        bail!("for_each frame mismatch");
                    };
                    *index += 1;
                    if *index >= items.len() {
                        loop_frames.remove(pos);
                        EdgePort::After
                    } else {
                        run_vars.insert(item_var.clone(), items[*index].clone());
                        EdgePort::Body
                    }
                } else {
                    let items = list_from_vars(&cfg.list_variable, &run_vars)?;
                    if items.is_empty() {
                        EdgePort::After
                    } else {
                        run_vars.insert(cfg.item_variable.clone(), items[0].clone());
                        loop_frames.push(LoopFrame::ForEach {
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
                    variables: None,
                };
                events.push(executed.clone());
                on_event(executed);
                routed = Some(route_to(&routes, &node.id, port)?);
            }
            NodeKind::WhileLoop => {
                let control = node
                    .control
                    .as_ref()
                    .context("while_loop node without control")?;
                let ControlKind::While(cfg) = control else {
                    bail!("while_loop node has wrong control kind");
                };

                let active = loop_frames.iter().any(|f| {
                    matches!(
                        f,
                        LoopFrame::While { while_id } if while_id == &node.id
                    )
                });
                let pass = eval_if(&cfg.condition, &run_vars)?;
                let port = if pass {
                    if !active {
                        loop_frames.push(LoopFrame::While {
                            while_id: node.id.clone(),
                        });
                    }
                    EdgePort::Body
                } else if active {
                    loop_frames.retain(|f| {
                        !matches!(
                            f,
                            LoopFrame::While { while_id } if while_id == &node.id
                        )
                    });
                    EdgePort::After
                } else {
                    EdgePort::After
                };

                let summary = format!(
                    "while {} {} {} => {}",
                    cfg.condition.left,
                    compare_op_label(cfg.condition.operator),
                    cfg.condition.right,
                    port.as_str()
                );
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary,
                    variables: None,
                };
                events.push(executed.clone());
                on_event(executed);
                routed = Some(route_to(&routes, &node.id, port)?);
            }
            NodeKind::Repeat => {
                let control = node
                    .control
                    .as_ref()
                    .context("repeat node without control")?;
                let ControlKind::Repeat(cfg) = control else {
                    bail!("repeat node has wrong control kind");
                };

                let returning = loop_frames.iter().rposition(|f| {
                    matches!(
                        f,
                        LoopFrame::Repeat { repeat_id, .. } if repeat_id == &node.id
                    )
                });

                let port = if let Some(pos) = returning {
                    let frame = &mut loop_frames[pos];
                    let LoopFrame::Repeat {
                        times,
                        index,
                        index_var,
                        ..
                    } = frame
                    else {
                        bail!("repeat frame mismatch");
                    };
                    *index += 1;
                    if *index >= *times {
                        loop_frames.remove(pos);
                        EdgePort::After
                    } else {
                        run_vars.insert(index_var.clone(), index.to_string());
                        EdgePort::Body
                    }
                } else {
                    let times_raw = resolve_operand(&cfg.times, &run_vars)?;
                    let times_f = parse_number(&times_raw)?;
                    if times_f < 0.0 {
                        bail!("repeat times must be >= 0");
                    }
                    let times = times_f.round() as usize;
                    if times == 0 {
                        EdgePort::After
                    } else {
                        run_vars.insert(cfg.index_variable.clone(), "0".into());
                        loop_frames.push(LoopFrame::Repeat {
                            repeat_id: node.id.clone(),
                            times,
                            index: 0,
                            index_var: cfg.index_variable.clone(),
                        });
                        EdgePort::Body
                    }
                };

                let summary = format!("repeat `{}` -> port {}", cfg.times, port.as_str());
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary,
                    variables: None,
                };
                events.push(executed.clone());
                on_event(executed);
                routed = Some(route_to(&routes, &node.id, port)?);
            }
            NodeKind::NextLoop => {
                let frame = loop_frames
                    .last_mut()
                    .context("next_loop outside a loop")?;
                routed = Some(match frame {
                    LoopFrame::ForEach {
                        items,
                        index,
                        item_var,
                        for_each_id,
                    } => {
                        *index += 1;
                        if *index >= items.len() {
                            let id = for_each_id.clone();
                            loop_frames.pop();
                            route_to(&routes, &id, EdgePort::After)?
                        } else {
                            run_vars.insert(item_var.clone(), items[*index].clone());
                            route_to(&routes, for_each_id, EdgePort::Body)?
                        }
                    }
                    LoopFrame::While { while_id } => while_id.clone(),
                    LoopFrame::Repeat {
                        times,
                        index,
                        index_var,
                        repeat_id,
                    } => {
                        *index += 1;
                        if *index >= *times {
                            let id = repeat_id.clone();
                            loop_frames.pop();
                            route_to(&routes, &id, EdgePort::After)?
                        } else {
                            run_vars.insert(index_var.clone(), index.to_string());
                            route_to(&routes, repeat_id, EdgePort::Body)?
                        }
                    }
                });
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary: "next_loop".into(),
                    variables: None,
                };
                events.push(executed.clone());
                on_event(executed);
            }
            NodeKind::ExitLoop => {
                let frame = loop_frames.pop().context("exit_loop outside a loop")?;
                let loop_id = loop_frame_id(&frame).to_string();
                routed = Some(route_to(&routes, &loop_id, EdgePort::After)?);
                let executed = RunEvent::ActionExecuted {
                    node_id: node.id.clone(),
                    summary: "exit_loop".into(),
                    variables: None,
                };
                events.push(executed.clone());
                on_event(executed);
            }
        }

        let exit = RunEvent::NodeExit {
            node_id: node.id.clone(),
            flow_ref: Some(flow_ref_owned.clone()),
        };
        events.push(exit.clone());
        on_event(exit);

        current = if let Some(next) = routed {
            next
        } else {
            route_to(&routes, &current, EdgePort::Main)?
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

    #[test]
    fn variables_loops_demo_runs() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../examples/variables-loops-demo");
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
        assert!(logs.iter().any(|s| s.contains("while body counter=0")));
        assert!(logs.iter().any(|s| s.contains("done counter=4")));
        assert!(logs.iter().any(|s| s.contains("repeat index=3")));
    }

    #[test]
    fn files_lists_demo_runs() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../examples/files-lists-demo");
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
        assert!(logs.iter().any(|s| s.contains("item=alpha")));
        let report_path = path.join("output/report.txt");
        let text = std::fs::read_to_string(&report_path).expect("report file");
        assert!(text.contains("report"));
        assert!(text.contains("item=alpha"));
        assert!(text.contains("item=beta"));
        let _ = std::fs::remove_file(&report_path);
    }

    #[test]
    fn flow_compose_isolated_demo_runs() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../examples/flow-compose-isolated");
        let project = load_project(&path).expect("demo project");
        let outcome = run_project_with_listener(&project, Some(path.as_path()), |_| {})
            .expect("run");
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
        assert!(logs.iter().any(|s| s.contains("result=ok-from-parent")));
        let parent_log = logs
            .iter()
            .find(|s| s.contains("parent_marker="))
            .expect("parent log line");
        assert!(parent_log.contains("parent_marker=visible"));
        assert!(!parent_log.contains("leak-me-not"));
    }

    #[test]
    fn flow_compose_subflow_demo_runs() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../examples/flow-compose-subflow");
        let project = load_project(&path).expect("demo project");
        let outcome = run_project_with_listener(&project, Some(path.as_path()), |_| {})
            .expect("run");
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
        assert!(logs.iter().any(|s| s.contains("Message: Hi Embedded (inline)")));
    }

    #[test]
    fn flow_compose_demo_runs() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../examples/flow-compose-demo");
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
        assert!(logs.iter().any(|s| s.contains("From child: Hello, Hoblio!")));
        assert!(logs.iter().any(|s| s.contains("Done flag: yes")));
        assert!(
            outcome
                .events
                .iter()
                .any(|e| matches!(e, RunEvent::FlowStarted { flow_ref, .. } if flow_ref == "greet"))
        );
    }

    #[test]
    fn resilience_demo_runs() {
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/resilience-demo");
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
        assert!(logs.iter().any(|s| s.contains("failed (continued)")));
        assert!(logs.iter().any(|s| s.contains("continued after read failure")));
    }
}
