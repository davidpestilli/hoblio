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
    /// Click an element matched by CSS selector (requires prior `browser_navigate` in the same run).
    BrowserClick {
        selector: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timeout_ms: Option<u64>,
    },
    /// Clear then type into an input-like element.
    BrowserFill {
        selector: String,
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timeout_ms: Option<u64>,
    },
    /// Wait until an element matching the selector is present.
    BrowserWaitFor {
        selector: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timeout_ms: Option<u64>,
    },
    /// Read visible text from an element; value is included in the action summary log.
    BrowserGetText {
        selector: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timeout_ms: Option<u64>,
        /// Run variable name; full text is stored for `{name}` in later actions (e.g. file_write).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        variable: Option<String>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_actions_roundtrip_json() {
        let actions = [
            ActionKind::BrowserClick {
                selector: "#go".into(),
                timeout_ms: Some(5000),
            },
            ActionKind::BrowserFill {
                selector: "input[name=q]".into(),
                text: "hello".into(),
                timeout_ms: None,
            },
            ActionKind::BrowserWaitFor {
                selector: "h1".into(),
                timeout_ms: Some(3000),
            },
            ActionKind::BrowserGetText {
                selector: "h1".into(),
                timeout_ms: None,
                variable: Some("title".into()),
            },
        ];
        for action in actions {
            let json = serde_json::to_string(&action).unwrap();
            let back: ActionKind = serde_json::from_str(&json).unwrap();
            assert_eq!(action, back);
        }
    }

    #[test]
    fn browser_get_text_snake_case_tag() {
        let json = r#"{"type":"browser_get_text","selector":"h1"}"#;
        let action: ActionKind = serde_json::from_str(json).unwrap();
        assert!(matches!(
            action,
            ActionKind::BrowserGetText {
                selector,
                timeout_ms: None,
                variable: None
            } if selector == "h1"
        ));
    }
}

/// Semantic role of a node in the flowchart.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Start,
    Action,
    End,
    /// Branch on `control` (If).
    If,
    /// Iterate list in `control` (ForEach); body returns via edge back to this node.
    ForEach,
    /// Skip to next iteration of innermost ForEach (PAD Next loop).
    NextLoop,
    /// Leave innermost ForEach via its `after` port (PAD Exit loop).
    ExitLoop,
}
