use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// How child flow variables merge back into the parent run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RunFlowVariableScope {
    /// Child sees and updates the parent run map (default).
    #[default]
    Inherit,
    /// Child starts from inputs/seeds; only `outputs` return to the parent.
    Isolated,
}

/// Text field layout for [`ActionKind::ShowGetUserInput`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum UserInputKind {
    #[default]
    SingleLine,
    MultiLine,
}

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
        /// When true (default), launch Chromium with a visible window instead of headless.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        show_on_screen: Option<bool>,
        /// When true (default with visible window), pass `--start-maximized` on launch.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        start_maximized: Option<bool>,
    },
    /// Click an element matched by CSS selector (requires prior `browser_navigate` in the same run).
    BrowserClick {
        selector: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timeout_ms: Option<u64>,
        /// When true, wait for a navigation after the click (same timeout as element wait).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        wait_for_navigation: Option<bool>,
        /// After click (and optional navigation wait), wait until this selector exists.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        wait_selector_after: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        wait_after_timeout_ms: Option<u64>,
    },
    /// Wait until the page finishes a navigation (e.g. after a link click).
    BrowserWaitNavigation {
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
    /// Write text to a file (overwrites); path relative to project folder when relative.
    FileWrite { path: String, content: String },
    /// Append text to a file (creates file if missing).
    FileAppend { path: String, content: String },
    /// Read entire file as UTF-8 into a run variable.
    FileRead {
        path: String,
        variable: String,
    },
    /// Append one item to a JSON string list run variable (creates empty list if missing).
    ListAppend {
        list_variable: String,
        item: String,
    },
    /// Reset a list run variable to `[]`.
    ListClear { list_variable: String },
    /// Pause the flow for a fixed duration.
    Delay { milliseconds: u64 },
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
    /// Native input dialog (Windows; blocks until OK/Cancel).
    ShowGetUserInput {
        title: String,
        message: String,
        #[serde(default, skip_serializing_if = "String::is_empty")]
        default_value: String,
        #[serde(default)]
        input_kind: UserInputKind,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        topmost: Option<bool>,
        #[serde(default = "default_user_input_var")]
        user_input_variable: String,
        #[serde(default = "default_button_pressed_var")]
        button_pressed_variable: String,
    },
    /// Assign a run variable (PAD-style Set variable).
    SetVariable {
        variable: String,
        /// Supports `{other}` interpolation from existing run variables.
        value: String,
    },
    /// Add to a numeric run variable (default amount 1).
    IncreaseVariable {
        variable: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        amount: Option<String>,
    },
    /// Subtract from a numeric run variable (default amount 1).
    DecreaseVariable {
        variable: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        amount: Option<String>,
    },
    /// Run another flow file in-process (shared browser session and run variables).
    RunFlow {
        /// Key in `manifest.flows` (preferred when registered).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        flow_id: Option<String>,
        /// Path relative to project root (e.g. `flows/login.json`).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        path: Option<String>,
        /// Optional input bindings: child variable name → interpolated value template.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        inputs: Option<BTreeMap<String, String>>,
        /// With `inherit`, child variables merge into the parent run. With `isolated`, only these
        /// names are copied back (none when omitted or empty).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        outputs: Option<Vec<String>>,
        /// When true (default), reuse the current browser session.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        share_browser: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        variable_scope: Option<RunFlowVariableScope>,
    },
}

impl ActionKind {
    /// Variable names written when this action runs (PAD "Variables produced").
    pub fn produced_variables(&self) -> Vec<&str> {
        match self {
            ActionKind::BrowserGetText { variable, .. } => variable
                .as_deref()
                .filter(|v| !v.is_empty())
                .into_iter()
                .collect(),
            ActionKind::SetVariable { variable, .. } if !variable.is_empty() => {
                vec![variable.as_str()]
            }
            ActionKind::FileRead { variable, .. } if !variable.is_empty() => {
                vec![variable.as_str()]
            }
            ActionKind::ShowGetUserInput {
                user_input_variable,
                button_pressed_variable,
                ..
            } => [user_input_variable.as_str(), button_pressed_variable.as_str()]
                .into_iter()
                .filter(|v| !v.is_empty())
                .collect(),
            ActionKind::RunFlow { outputs, .. } => outputs
                .as_ref()
                .map(|names| {
                    names
                        .iter()
                        .map(String::as_str)
                        .filter(|v| !v.is_empty())
                        .collect()
                })
                .unwrap_or_default(),
            _ => vec![],
        }
    }

    pub fn run_flow_target(&self) -> Option<(&str, Option<&str>)> {
        let ActionKind::RunFlow { flow_id, path, .. } = self else {
            return None;
        };
        match (flow_id.as_deref(), path.as_deref()) {
            (Some(id), _) if !id.is_empty() => Some((id, path.as_deref())),
            (_, Some(p)) if !p.is_empty() => Some((p, None)),
            _ => None,
        }
    }
}

fn default_user_input_var() -> String {
    "UserInput".into()
}

fn default_button_pressed_var() -> String {
    "ButtonPressed".into()
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
                wait_for_navigation: Some(true),
                wait_selector_after: None,
                wait_after_timeout_ms: None,
            },
            ActionKind::BrowserWaitNavigation {
                timeout_ms: Some(8000),
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
    fn browser_navigate_show_on_screen_defaults_and_roundtrip() {
        let json = r#"{"type":"browser_navigate","url":"https://example.com"}"#;
        let action: ActionKind = serde_json::from_str(json).unwrap();
        assert!(matches!(
            action,
            ActionKind::BrowserNavigate {
                url,
                wait_ms: None,
                show_on_screen: None,
                start_maximized: None,
            } if url == "https://example.com"
        ));

        let with_flag = ActionKind::BrowserNavigate {
            url: "https://example.com".into(),
            wait_ms: Some(100),
            show_on_screen: Some(false),
            start_maximized: Some(false),
        };
        let back: ActionKind = serde_json::from_str(&serde_json::to_string(&with_flag).unwrap()).unwrap();
        assert_eq!(with_flag, back);
        let serialized = serde_json::to_string(&with_flag).unwrap();
        assert!(serialized.contains("show_on_screen"));
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

    #[test]
    fn show_get_user_input_roundtrip_and_produced() {
        let action = ActionKind::ShowGetUserInput {
            title: "Novo".into(),
            message: "Teste".into(),
            default_value: String::new(),
            input_kind: UserInputKind::SingleLine,
            topmost: Some(false),
            user_input_variable: "UserInput".into(),
            button_pressed_variable: "ButtonPressed".into(),
        };
        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("show_get_user_input"));
        let back: ActionKind = serde_json::from_str(&json).unwrap();
        assert_eq!(action, back);
        assert_eq!(
            back.produced_variables(),
            vec!["UserInput", "ButtonPressed"]
        );
    }

    #[test]
    fn run_flow_roundtrip() {
        let action = ActionKind::RunFlow {
            flow_id: Some("login".into()),
            path: None,
            inputs: None,
            outputs: Some(vec!["sessao_ok".into()]),
            share_browser: Some(true),
            variable_scope: None,
        };
        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("run_flow"));
        let back: ActionKind = serde_json::from_str(&json).unwrap();
        assert_eq!(action, back);
    }

    #[test]
    fn set_variable_roundtrip_and_produced() {
        let action = ActionKind::SetVariable {
            variable: "flag".into(),
            value: "{other}".into(),
        };
        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("set_variable"));
        let back: ActionKind = serde_json::from_str(&json).unwrap();
        assert_eq!(action, back);
        assert_eq!(back.produced_variables(), vec!["flag"]);
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
    /// Loop while `control.condition` is true (PAD Loop while).
    WhileLoop,
    /// Loop body a fixed number of times (PAD Loop N times).
    Repeat,
}
