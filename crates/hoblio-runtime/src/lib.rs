//! Walk the flow graph from `start` and execute flow actions.

mod actions;
mod browser;
mod chromium_exe;
mod events;
mod exec;
mod show_message;
mod variables;

pub use events::{RunEvent, RunOutcome};
pub use exec::{run_project, run_project_with_listener};

use hoblio_model::FlowProject;

pub fn run(project: &FlowProject) -> anyhow::Result<RunOutcome> {
    run_project(project)
}
