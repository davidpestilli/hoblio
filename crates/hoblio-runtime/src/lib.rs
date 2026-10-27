//! Walk the flow graph from `start` and execute flow actions.

mod actions;
mod adjust_var;
mod files;
mod lists;
mod cancel;
mod browser;
mod chromium_exe;
mod events;
mod exec;
mod run_flow;
mod expr;
mod show_get_user_input;
mod show_message;
mod variables;

pub use cancel::{request_run_cancel, reset_run_cancel};
pub use events::{RunEvent, RunOutcome};
pub use exec::{run_project, run_project_with_listener};

use std::path::Path;

use hoblio_model::FlowProject;

pub fn run(project: &FlowProject) -> anyhow::Result<RunOutcome> {
    run_project(project)
}

pub fn run_with_root(
    project: &FlowProject,
    project_root: Option<&Path>,
) -> anyhow::Result<RunOutcome> {
    run_project_with_listener(project, project_root, |_| {})
}
