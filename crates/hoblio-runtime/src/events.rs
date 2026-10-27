use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RunEvent {
    RunStarted { project: String },
    FlowStarted {
        flow_ref: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        parent_node_id: Option<String>,
    },
    FlowFinished {
        flow_ref: String,
        end_node_id: String,
    },
    NodeEnter {
        node_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        flow_ref: Option<String>,
    },
    NodeExit {
        node_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        flow_ref: Option<String>,
    },
    ActionExecuted {
        node_id: String,
        summary: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        variables: Option<HashMap<String, String>>,
    },
    RunFinished { last_node: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunOutcome {
    pub events: Vec<RunEvent>,
    pub last_node_id: String,
}
