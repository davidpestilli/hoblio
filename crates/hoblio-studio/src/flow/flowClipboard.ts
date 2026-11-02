import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

import { MarkerType } from "@xyflow/react";

import { newActionNodeId } from "../flowConvert";
import type { FlowEdge, FlowNode } from "../model";
import type { HoblioFlowEdge, HoblioFlowNode } from "./flowTypes";
import { newEdgeId } from "./flowTypes";

export const HOBLIO_FLOW_CLIPBOARD_PREFIX = "hoblio-flow-clipboard:v1:";

export interface FlowClipboardFragment {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

let sessionClipboard: FlowClipboardFragment | null = null;

export function serializeFragment(fragment: FlowClipboardFragment): string {
  return HOBLIO_FLOW_CLIPBOARD_PREFIX + JSON.stringify(fragment);
}

export function parseClipboardText(text: string): FlowClipboardFragment | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(HOBLIO_FLOW_CLIPBOARD_PREFIX)) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed.slice(HOBLIO_FLOW_CLIPBOARD_PREFIX.length)) as FlowClipboardFragment;
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeFragmentToClipboard(fragment: FlowClipboardFragment): Promise<void> {
  sessionClipboard = fragment;
  const text = serializeFragment(fragment);
  try {
    await writeText(text);
  } catch {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* session buffer still holds the fragment */
    }
  }
}

export async function readFragmentFromClipboard(): Promise<FlowClipboardFragment | null> {
  if (sessionClipboard) {
    return sessionClipboard;
  }
  try {
    const text = await readText();
    if (text) {
      const parsed = parseClipboardText(text);
      if (parsed) {
        return parsed;
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const text = await navigator.clipboard.readText();
    return text ? parseClipboardText(text) : null;
  } catch {
    return null;
  }
}

export function fragmentFromCanvas(
  nodes: HoblioFlowNode[],
  edges: HoblioFlowEdge[],
): FlowClipboardFragment | null {
  const selectedNodeIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
  if (selectedNodeIds.size === 0) {
    for (const edge of edges) {
      if (!edge.selected) {
        continue;
      }
      selectedNodeIds.add(edge.source);
      selectedNodeIds.add(edge.target);
    }
  }
  if (selectedNodeIds.size === 0) {
    return null;
  }

  const selectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id));
  const flowNodes = selectedNodes.map((node) => ({
    ...structuredClone(node.data.flowNode),
    ui: { x: node.position.x, y: node.position.y },
  }));

  const flowEdges: FlowEdge[] = edges
    .filter(
      (edge) =>
        edge.selected || (selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)),
    )
    .map((edge) => {
      const flowEdge = edge.data?.flowEdge;
      return {
        from: edge.source,
        to: edge.target,
        port: flowEdge?.port,
        label: flowEdge?.label,
        ui: flowEdge?.ui,
      };
    });

  return { nodes: flowNodes, edges: flowEdges };
}

function newPastedNodeId(kind: FlowNode["kind"], taken: Set<string>): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const id =
      kind === "action"
        ? newActionNodeId()
        : `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
  const fallback = `${kind}_${Math.random().toString(36).slice(2, 10)}`;
  taken.add(fallback);
  return fallback;
}

const PASTE_OFFSET = { x: 40, y: 40 };

export function applyFragmentToCanvas(
  fragment: FlowClipboardFragment,
  existingNodes: HoblioFlowNode[],
  existingEdges: HoblioFlowEdge[],
): {
  nodes: HoblioFlowNode[];
  edges: HoblioFlowEdge[];
  newStart: string | null;
} | null {
  if (fragment.nodes.length === 0) {
    return null;
  }

  const existingStart = existingNodes.find((node) => node.data.flowNode.kind === "start");
  const canvasHasStart = existingStart != null;
  const skippedStartIds = new Set(
    canvasHasStart ? fragment.nodes.filter((node) => node.kind === "start").map((node) => node.id) : [],
  );
  const nodesToPaste = canvasHasStart
    ? fragment.nodes.filter((node) => node.kind !== "start")
    : fragment.nodes;
  if (nodesToPaste.length === 0) {
    return null;
  }

  const takenIds = new Set(existingNodes.map((node) => node.id));
  const idMap = new Map<string, string>();
  for (const node of nodesToPaste) {
    idMap.set(node.id, newPastedNodeId(node.kind, takenIds));
  }

  const pastedNodes: HoblioFlowNode[] = nodesToPaste.map((node) => {
    const newId = idMap.get(node.id)!;
    const x = (node.ui?.x ?? 0) + PASTE_OFFSET.x;
    const y = (node.ui?.y ?? 0) + PASTE_OFFSET.y;
    return {
      id: newId,
      type: "hoblio",
      position: { x, y },
      selected: true,
      data: {
        flowNode: {
          ...structuredClone(node),
          id: newId,
          ui: { x, y },
        },
      },
    };
  });

  const pastedEdges: HoblioFlowEdge[] = [];
  for (const edge of fragment.edges) {
    let source = idMap.get(edge.from);
    const target = idMap.get(edge.to);
    if (!source && target && existingStart && skippedStartIds.has(edge.from)) {
      source = existingStart.id;
    }
    if (!source || !target) {
      continue;
    }
    const id = newEdgeId();
    const sourceHandle = edge.ui?.sourceHandle;
    pastedEdges.push({
      id,
      type: "waypoint",
      source,
      target,
      sourceHandle,
      targetHandle: edge.ui?.targetHandle,
      label: edge.label,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      data: {
        flowEdge: {
          ...edge,
          id,
          from: source,
          to: target,
        },
        waypoints: edge.ui?.waypoints ?? [],
      },
    });
  }

  const deselectedExisting = existingNodes.map((node) => ({ ...node, selected: false }));
  const clearedEdgeSelection = existingEdges.map((edge) => ({ ...edge, selected: false }));

  let newStart: string | null = null;
  if (!canvasHasStart) {
    const pastedStart = pastedNodes.find((node) => node.data.flowNode.kind === "start");
    if (pastedStart) {
      newStart = pastedStart.id;
    }
  }

  return {
    nodes: [...deselectedExisting, ...pastedNodes],
    edges: [...clearedEdgeSelection, ...pastedEdges],
    newStart,
  };
}
