//! Core types for Hoblio flow projects (folder + JSON flowchart).

mod action;
mod control;
mod flow;
mod project;
mod validate;

pub use action::{ActionKind, LogAction, NodeKind};
pub use control::{CompareOperator, ControlKind, EdgePort, ForEachControl, IfControl};
pub use flow::{Edge, FlowGraph, Node, NodeId};
pub use project::{FlowManifest, FlowProject, ProjectVariables};
pub use validate::{ValidationError, validate_graph, validate_project};
