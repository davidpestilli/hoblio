use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RunEvent {
    RunStarted { project: String },
    NodeEnter { node_id: String },
    NodeExit { node_id: String },
    ActionExecuted { node_id: String, summary: String },
    RunFinished { last_node: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunOutcome {
    pub events: Vec<RunEvent>,
    pub last_node_id: String,
}
