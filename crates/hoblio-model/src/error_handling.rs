use serde::{Deserialize, Serialize};

/// Per action-node retry and failure policy (PAD-style subset).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ErrorHandling {
    /// Extra attempts after the first failure (0 = no retry).
    #[serde(default)]
    pub retry_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retry_delay_ms: Option<u64>,
    #[serde(default)]
    pub on_failure: OnFailure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum OnFailure {
    #[default]
    Stop,
    Continue,
}

impl ErrorHandling {
    /// Total tries = 1 initial run + `retry_count` retries.
    pub fn attempts(&self) -> u32 {
        1 + self.retry_count
    }

    pub fn continues_on_failure(&self) -> bool {
        matches!(self.on_failure, OnFailure::Continue)
    }
}

pub type ActionErrorHandling = ErrorHandling;
pub type FailurePolicy = OnFailure;
