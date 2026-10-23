//! Walk the flow graph from `start` and execute flow actions.

mod actions;
mod events;
mod exec;

pub use events::{RunEvent, RunOutcome};
pub use exec::{run_project, run_project_with_listener};

use hoblio_model::FlowProject;

pub fn run(project: &FlowProject) -> anyhow::Result<RunOutcome> {
    run_project(project)
}
