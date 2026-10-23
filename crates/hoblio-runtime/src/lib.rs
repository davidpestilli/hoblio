//! Walk the flow graph from `start` and execute stub actions (Phase 0).

mod events;
mod exec;

pub use events::{RunEvent, RunOutcome};
pub use exec::run_project;

use hoblio_model::FlowProject;

pub fn run(project: &FlowProject) -> anyhow::Result<RunOutcome> {
    run_project(project)
}
