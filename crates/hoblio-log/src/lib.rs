//! Tracing setup for CLI and future studio.

use std::path::Path;
use std::sync::OnceLock;

use anyhow::{Context, Result};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

static FILE_GUARD: OnceLock<tracing_appender::non_blocking::WorkerGuard> = OnceLock::new();

/// Human-readable logs on stderr; with `jsonl`, append JSON lines to `<project>/.hoblio/run.jsonl`.
pub fn init(project_root: Option<&Path>, jsonl: bool) -> Result<()> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        // chromiumoxide emits noisy WS parse warnings at warn level during normal runs.
        EnvFilter::new("info,chromiumoxide=error")
    });

    let stderr = tracing_subscriber::fmt::layer()
        .with_target(false)
        .with_writer(std::io::stderr);

    let registry = tracing_subscriber::registry().with(filter).with(stderr);

    if jsonl {
        if let Some(root) = project_root {
            let log_dir = root.join(".hoblio");
            std::fs::create_dir_all(&log_dir)
                .with_context(|| format!("create {}", log_dir.display()))?;
            let file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_dir.join("run.jsonl"))
                .context("open run.jsonl")?;
            let (non_blocking, guard) = tracing_appender::non_blocking(file);
            let _ = FILE_GUARD.set(guard);
            registry
                .with(
                    tracing_subscriber::fmt::layer()
                        .json()
                        .with_writer(non_blocking)
                        .with_current_span(false),
                )
                .init();
            return Ok(());
        }
    }

    registry.init();
    Ok(())
}

pub fn runtime_event(name: &str, node_id: &str, detail: &str) {
    tracing::info!(event = name, node_id, detail);
}
