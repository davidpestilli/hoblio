use serde::{Deserialize, Serialize};

/// Executable action attached to a flow node (Phase 0: stubs for future MVP actions).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ActionKind {
    Log(LogAction),
    NoOp,
    /// Open a URL in Chromium via CDP (MVP).
    BrowserNavigate {
        url: String,
        /// Optional pause after navigation (milliseconds).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        wait_ms: Option<u64>,
    },
    /// Placeholder — write text to a file (MVP).
    FileWrite { path: String, content: String },
    /// Placeholder — HTTP GET (MVP).
    HttpGet { url: String },
    /// Simple native message window (Windows; non-blocking).
    ShowMessage {
        title: String,
        text: String,
        /// Auto-close after N seconds when set and > 0; otherwise stays until user closes.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timeout_seconds: Option<f64>,
    },
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
