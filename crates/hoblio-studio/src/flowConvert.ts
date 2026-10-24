import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { FlowEdge, FlowGraph, FlowNode } from "./model";
import type { HoblioFlowEdge, HoblioNodeData } from "./flow/flowTypes";

export type { HoblioNodeData };

function resolveEdgeId(edge: FlowEdge, index: number): string {
  return edge.id ?? `e-${edge.from}-${edge.to}-${index}`;
}

export function graphToFlow(graph: FlowGraph): { nodes: Node<HoblioNodeData>[]; edges: HoblioFlowEdge[] } {
  const nodes: Node<HoblioNodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "hoblio",
    position: { x: n.ui?.x ?? 0, y: n.ui?.y ?? 0 },
    data: { flowNode: n },
  }));
  const edges: HoblioFlowEdge[] = graph.edges.map((e, i) => {
    const id = resolveEdgeId(e, i);
    return {
      id,
      type: "waypoint",
      source: e.from,
      target: e.to,
      sourceHandle: e.ui?.sourceHandle,
      targetHandle: e.ui?.targetHandle,
      label: e.label,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      data: {
        flowEdge: { ...e, id },
        waypoints: e.ui?.waypoints ?? [],
      },
    };
  });
  return { nodes, edges };
}

export function flowToGraph(
  nodes: Node<HoblioNodeData>[],
  edges: Edge[],
  start: string,
): FlowGraph {
  const flowNodes: FlowNode[] = nodes.map((n) => {
    const base = n.data.flowNode;
    return {
      ...base,
      ui: { x: n.position.x, y: n.position.y },
    };
  });
  const flowEdges: FlowEdge[] = edges.map((e) => {
    const data = (e as HoblioFlowEdge).data;
    const waypoints = data?.waypoints ?? [];
    const flowEdge = data?.flowEdge;
    const sourceHandle = typeof e.sourceHandle === "string" ? e.sourceHandle : undefined;
    const targetHandle = typeof e.targetHandle === "string" ? e.targetHandle : undefined;
    const ui =
      waypoints.length > 0 || sourceHandle || targetHandle
        ? { waypoints: waypoints.length > 0 ? waypoints : undefined, sourceHandle, targetHandle }
        : undefined;
    return {
      id: e.id,
      from: e.source,
      to: e.target,
      label: typeof e.label === "string" ? e.label : flowEdge?.label,
      ui,
    };
  });
  return { start, nodes: flowNodes, edges: flowEdges };
}

export function newActionNodeId(): string {
  return `action_${Date.now().toString(36)}`;
}
