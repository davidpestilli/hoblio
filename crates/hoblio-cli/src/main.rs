use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};
use hoblio_log::init as init_log;
use hoblio_runtime::{RunEvent, run_project_with_listener};
use hoblio_serde::{load_project, validate_project_dir};

#[derive(Parser)]
#[command(name = "hoblio", about = "Hoblio flow runner")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Load a project folder and execute the flow from Start.
    Run {
        project_dir: PathBuf,
        /// Append structured run logs to `<project>/.hoblio/run.jsonl`.
        #[arg(long)]
        jsonl: bool,
    },
    /// Validate manifest, flow schema, and graph invariants.
    Validate {
        project_dir: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Run { project_dir, jsonl } => {
            init_log(Some(&project_dir), jsonl)?;
            let project = load_project(&project_dir)?;
            let outcome = run_project_with_listener(&project, Some(project_dir.as_path()), |event| {
                if let RunEvent::ActionExecuted { summary, .. } = event {
                    println!("{summary}");
                }
            })?;
            eprintln!(
                "run complete: project={} last_node={}",
                project.manifest.name, outcome.last_node_id
            );
        }
        Commands::Validate { project_dir } => {
            init_log(None, false)?;
            validate_project_dir(&project_dir)?;
            eprintln!("valid: {}", project_dir.display());
        }
    }
    Ok(())
}
