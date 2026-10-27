//! Core types for Hoblio flow projects (folder + JSON flowchart).

mod action;
mod control;
mod error_handling;
mod flow;
mod project;
mod subflow;
mod validate;

pub use action::{ActionKind, LogAction, NodeKind, RunFlowVariableScope, UserInputKind};
pub use control::{
    CompareOperator, ControlKind, EdgePort, ForEachControl, IfControl, RepeatControl, WhileControl,
};
pub use error_handling::{ActionErrorHandling, ErrorHandling, FailurePolicy, OnFailure};
pub use flow::{Edge, FlowGraph, Node, NodeId};
pub use subflow::SubflowBundle;
pub use project::{FlowManifest, FlowManifestEntry, FlowProject, ProjectVariables};
pub use validate::{ValidationError, validate_graph, validate_project};
