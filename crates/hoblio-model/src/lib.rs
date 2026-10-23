//! Core types for Hoblio flow projects (folder + JSON flowchart).

mod action;
mod flow;
mod project;
mod validate;

pub use action::{ActionKind, LogAction, NodeKind};
pub use flow::{Edge, FlowGraph, Node, NodeId};
pub use project::{FlowManifest, FlowProject, ProjectVariables};
pub use validate::{ValidationError, validate_graph};
