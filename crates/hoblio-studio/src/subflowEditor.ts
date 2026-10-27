import type { ActionKind, FlowGraph, FlowNode, SubflowBundle } from "./model";
import type { FlowDocument } from "./projectFlows";

export const SUBFLOW_KEY_SEP = "#subflow:";

export type EditorTarget =
  | { kind: "file"; path: string }
  | { kind: "subflow"; ownerPath: string; subflowId: string };

export function subflowEditorKey(ownerPath: string, subflowId: string): string {
  return `${ownerPath}${SUBFLOW_KEY_SEP}${subflowId}`;
}

export function parseEditorKey(key: string): EditorTarget {
  const idx = key.indexOf(SUBFLOW_KEY_SEP);
  if (idx === -1) {
    return { kind: "file", path: key };
  }
  return {
    kind: "subflow",
    ownerPath: key.slice(0, idx),
    subflowId: key.slice(idx + SUBFLOW_KEY_SEP.length),
  };
}

export function ownerFilePath(key: string): string {
  const t = parseEditorKey(key);
  return t.kind === "file" ? t.path : t.ownerPath;
}

export function isSubflowEditor(key: string): boolean {
  return parseEditorKey(key).kind === "subflow";
}

export function subflowBundleToGraph(bundle: SubflowBundle): FlowGraph {
  return {
    start: bundle.start,
    nodes: bundle.nodes,
    edges: bundle.edges,
    subflows: undefined,
  };
}

export function graphToSubflowBundle(graph: FlowGraph, variables: Record<string, unknown>): SubflowBundle {
  return {
    start: graph.start,
    nodes: graph.nodes,
    edges: graph.edges,
    variables: Object.keys(variables).length > 0 ? variables : undefined,
  };
}

export function defaultSubflowBundle(subflowId: string): SubflowBundle {
  const start = `${subflowId}_start`;
  const end = `${subflowId}_end`;
  return {
    start,
    nodes: [
      { id: start, kind: "start", label: "Start", ui: { x: 80, y: 120 } },
      { id: end, kind: "end", label: "End", ui: { x: 420, y: 120 } },
    ],
    edges: [{ from: start, to: end }],
    variables: {},
  };
}

export function newSubflowId(existing: Iterable<string>): string {
  const taken = new Set(existing);
  let n = 1;
  while (taken.has(`subflow_${n}`)) {
    n += 1;
  }
  return `subflow_${n}`;
}

/** Main canvas graph (excludes embedded subflow definitions). */
export function mainGraphFromDocument(doc: FlowDocument): FlowGraph {
  const { subflows: _s, ...rest } = doc.graph;
  return { ...rest, subflows: undefined };
}

export function flushCanvasToDocument(
  target: EditorTarget,
  ownerDoc: FlowDocument,
  canvasGraph: FlowGraph,
  canvasVariables: Record<string, unknown>,
): FlowDocument {
  if (target.kind === "file") {
    return {
      graph: {
        ...canvasGraph,
        subflows: ownerDoc.graph.subflows,
      },
      variables: canvasVariables,
    };
  }
  const bundle = graphToSubflowBundle(canvasGraph, canvasVariables);
  const subflows = { ...(ownerDoc.graph.subflows ?? {}) };
  subflows[target.subflowId] = bundle;
  return {
    graph: {
      ...ownerDoc.graph,
      subflows,
    },
    variables: ownerDoc.variables,
  };
}

export function documentForEditorTarget(
  ownerDoc: FlowDocument,
  target: EditorTarget,
): FlowDocument {
  if (target.kind === "file") {
    return {
      graph: mainGraphFromDocument(ownerDoc),
      variables: ownerDoc.variables,
    };
  }
  const bundle = ownerDoc.graph.subflows?.[target.subflowId];
  if (!bundle) {
    throw new Error(`Subflow "${target.subflowId}" not found in ${target.ownerPath}`);
  }
  return {
    graph: subflowBundleToGraph(bundle),
    variables: bundle.variables ?? {},
  };
}

export function listSubflowIds(doc: FlowDocument | undefined): string[] {
  if (!doc?.graph.subflows) return [];
  return Object.keys(doc.graph.subflows).sort();
}

export function isValidSubflowId(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed || trimmed !== id) return false;
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed);
}

function patchMainGraphRunFlowIds(
  graph: FlowGraph,
  oldId: string,
  newId: string | null,
): { graph: FlowGraph; updatedNodes: number } {
  let updatedNodes = 0;
  const nodes = graph.nodes.map((node) => {
    const patched = patchNodeRunFlowId(node, oldId, newId);
    if (patched !== node) updatedNodes += 1;
    return patched;
  });
  return { graph: { ...graph, nodes }, updatedNodes };
}

function patchNodeRunFlowId(node: FlowNode, oldId: string, newId: string | null): FlowNode {
  const action = node.action;
  if (!action || action.type !== "run_flow" || action.flow_id !== oldId) {
    return node;
  }
  const next: ActionKind = {
    ...action,
    flow_id: newId ?? undefined,
  };
  return { ...node, action: next };
}

export type RenameSubflowResult =
  | { ok: true; doc: FlowDocument; updatedRunFlowNodes: number }
  | { ok: false; error: string };

export function renameSubflowInDocument(
  doc: FlowDocument,
  oldId: string,
  newId: string,
): RenameSubflowResult {
  if (!isValidSubflowId(newId)) {
    return { ok: false, error: "Use letters, numbers, underscore; start with letter or _." };
  }
  if (oldId === newId) {
    return { ok: true, doc, updatedRunFlowNodes: 0 };
  }
  const subflows = doc.graph.subflows;
  if (!subflows?.[oldId]) {
    return { ok: false, error: `Subflow "${oldId}" not found.` };
  }
  if (subflows[newId]) {
    return { ok: false, error: `Subflow "${newId}" already exists.` };
  }
  const nextSubflows = { ...subflows };
  nextSubflows[newId] = nextSubflows[oldId];
  delete nextSubflows[oldId];
  const { graph, updatedNodes } = patchMainGraphRunFlowIds(
    { ...doc.graph, subflows: nextSubflows },
    oldId,
    newId,
  );
  return { ok: true, doc: { ...doc, graph }, updatedRunFlowNodes: updatedNodes };
}

export type DeleteSubflowResult =
  | { ok: true; doc: FlowDocument; clearedRunFlowNodes: number }
  | { ok: false; error: string };

export function deleteSubflowFromDocument(doc: FlowDocument, subflowId: string): DeleteSubflowResult {
  if (!doc.graph.subflows?.[subflowId]) {
    return { ok: false, error: `Subflow "${subflowId}" not found.` };
  }
  const nextSubflows = { ...doc.graph.subflows };
  delete nextSubflows[subflowId];
  const subflowsField =
    Object.keys(nextSubflows).length > 0 ? nextSubflows : undefined;
  const { graph, updatedNodes } = patchMainGraphRunFlowIds(
    { ...doc.graph, subflows: subflowsField },
    subflowId,
    null,
  );
  return { ok: true, doc: { ...doc, graph }, clearedRunFlowNodes: updatedNodes };
}
