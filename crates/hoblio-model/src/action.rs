use serde::{Deserialize, Serialize};

/// Executable action attached to a flow node (Phase 0: stubs for future MVP actions).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ActionKind {
    Log(LogAction),
    NoOp,
    /// Placeholder — browser navigation (MVP).
    BrowserNavigate { url: String },
    /// Placeholder — write text to a file (MVP).
    FileWrite { path: String, content: String },
    /// Placeholder — HTTP GET (MVP).
    HttpGet { url: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogAction {
    pub message: String,
}

/// Semantic role of a node in the flowchart.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Start,
    Action,
    End,
}
