import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { EdgePort, FlowEdge, FlowGraph, FlowNode } from "./model";
import type { HoblioFlowEdge, HoblioNodeData } from "./flow/flowTypes";

export type { HoblioNodeData };

const MAIN_SOURCE_HANDLE = "right";
const CONTROL_PORTS = new Set<EdgePort>(["then", "else", "body", "after"]);

function resolveEdgeId(edge: FlowEdge, index: number): string {
  return edge.id ?? `e-${edge.from}-${edge.to}-${index}`;
}

function defaultSourceHandle(
  flowNode: FlowNode | undefined,
  port: EdgePort | undefined,
): string | undefined {
  if (port && CONTROL_PORTS.has(port)) {
    return port;
  }
  if (!flowNode) {
    return MAIN_SOURCE_HANDLE;
  }
  if (
    flowNode.kind === "if" ||
    flowNode.kind === "for_each" ||
    flowNode.kind === "while_loop" ||
    flowNode.kind === "repeat"
  ) {
    return port;
  }
  return MAIN_SOURCE_HANDLE;
}

export function graphToFlow(graph: FlowGraph): { nodes: Node<HoblioNodeData>[]; edges: HoblioFlowEdge[] } {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const nodes: Node<HoblioNodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "hoblio",
    position: { x: n.ui?.x ?? 0, y: n.ui?.y ?? 0 },
    data: { flowNode: n },
  }));
  const edges: HoblioFlowEdge[] = graph.edges.map((e, i) => {
    const id = resolveEdgeId(e, i);
    const port = e.port ?? (e.ui?.sourceHandle as EdgePort | undefined);
    const sourceNode = nodesById.get(e.from);
    const sourceHandle = e.ui?.sourceHandle ?? defaultSourceHandle(sourceNode, port);
    return {
      id,
      type: "waypoint",
      source: e.from,
      target: e.to,
      sourceHandle,
      targetHandle: e.ui?.targetHandle,
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
  const nodesById = new Map(nodes.map((n) => [n.id, n.data.flowNode]));
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
    const portFromHandle = parseEdgePort(sourceHandle);
    const port = flowEdge?.port ?? portFromHandle;
    const sourceNode = nodesById.get(e.source);
    const normalizedHandle = sourceHandle ?? defaultSourceHandle(sourceNode, port);
    const isControl = port && CONTROL_PORTS.has(port);
    const persistSourceHandle =
      normalizedHandle &&
      normalizedHandle !== MAIN_SOURCE_HANDLE &&
      !(port && normalizedHandle === port);
    const ui =
      waypoints.length > 0 || targetHandle || persistSourceHandle
        ? {
            waypoints: waypoints.length > 0 ? waypoints : undefined,
            sourceHandle: persistSourceHandle ? normalizedHandle : undefined,
            targetHandle,
          }
        : undefined;
    return {
      from: e.source,
      to: e.target,
      port: isControl ? port : undefined,
      ui,
    };
  });
  return { start, nodes: flowNodes, edges: flowEdges };
}

export function newActionNodeId(): string {
  return `action_${Date.now().toString(36)}`;
}

const EDGE_PORTS: EdgePort[] = ["main", "then", "else", "body", "after"];

export function parseEdgePort(value: string | undefined): EdgePort | undefined {
  if (!value) return undefined;
  return EDGE_PORTS.includes(value as EdgePort) ? (value as EdgePort) : undefined;
}

export function sourceHandleKey(
  kind: FlowNode["kind"],
  handle: string | null | undefined,
): string {
  const h = handle ?? "main";
  if (
    kind === "if" ||
    kind === "for_each" ||
    kind === "while_loop" ||
    kind === "repeat"
  ) {
    return CONTROL_PORTS.has(h as EdgePort) ? h : "main";
  }
  return "main";
}
