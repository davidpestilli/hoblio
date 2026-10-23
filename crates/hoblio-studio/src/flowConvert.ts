import type { Edge, Node } from "@xyflow/react";
import type { FlowGraph, FlowNode } from "./model";

export type HoblioNodeData = {
  flowNode: FlowNode;
  active?: boolean;
};

export function graphToFlow(graph: FlowGraph): { nodes: Node<HoblioNodeData>[]; edges: Edge[] } {
  const nodes: Node<HoblioNodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "hoblio",
    position: { x: n.ui?.x ?? 0, y: n.ui?.y ?? 0 },
    data: { flowNode: n },
  }));
  const edges: Edge[] = graph.edges.map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
  }));
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
  const flowEdges = edges.map((e) => ({
    from: e.source,
    to: e.target,
  }));
  return { start, nodes: flowNodes, edges: flowEdges };
}

export function newActionNodeId(): string {
  return `action_${Date.now().toString(36)}`;
}
