use serde::{Deserialize, Serialize};

/// Outgoing edge role (PAD / n8n-style ports).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgePort {
    Main,
    Then,
    Else,
    Body,
    After,
}

impl EdgePort {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "main" => Some(Self::Main),
            "then" => Some(Self::Then),
            "else" => Some(Self::Else),
            "body" => Some(Self::Body),
            "after" => Some(Self::After),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::Then => "then",
            Self::Else => "else",
            Self::Body => "body",
            Self::After => "after",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ControlKind {
    If(IfControl),
    ForEach(ForEachControl),
    /// Re-evaluate `condition` on each visit; body returns to this node.
    While(WhileControl),
    /// Run body `times` (0-based index in `index_variable`).
    Repeat(RepeatControl),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IfControl {
    /// Variable name, `{var}`, or literal left operand.
    pub left: String,
    pub operator: CompareOperator,
    /// Variable name, `{var}`, or literal right operand.
    pub right: String,
    #[serde(default)]
    pub ignore_case: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompareOperator {
    Eq,
    Ne,
    Contains,
    Gt,
    Gte,
    Lt,
    Lte,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ForEachControl {
    /// Run variable holding a JSON string array (e.g. project variable `items`).
    pub list_variable: String,
    /// Variable name receiving each iteration value.
    pub item_variable: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WhileControl {
    #[serde(flatten)]
    pub condition: IfControl,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RepeatControl {
    /// Literal or `{var}` — number of body iterations.
    pub times: String,
    /// 0-based iteration index written before each body visit.
    pub index_variable: String,
}
