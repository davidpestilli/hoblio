import type { Edge, Node } from "@xyflow/react";

import type { FlowEdge, FlowNode, Waypoint } from "../model";

export type HoblioNodeData = {
  flowNode: FlowNode;
  active?: boolean;
};

export type HoblioFlowNode = Node<HoblioNodeData>;
export type HoblioFlowEdge = Edge<{ flowEdge: FlowEdge; waypoints: Waypoint[] }>;

export type { Waypoint };

export function newEdgeId(): string {
  return `edge_${Date.now().toString(36)}`;
}

export function nodeTitle(node: FlowNode | undefined, fallbackId: string): string {
  return node?.label ?? fallbackId;
}
