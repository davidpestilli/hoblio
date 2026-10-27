import type { FlowGraph, FlowManifest } from "./model";

export type ProjectFlowEntry = {
  id: string;
  /** File path or encoded subflow editor key (`flow.json#subflow:id`). */
  path: string;
  description?: string;
  kind?: "file" | "subflow";
};

export type FlowDocument = {
  graph: FlowGraph;
  variables: Record<string, unknown>;
};

export function entryFlowPath(manifest: FlowManifest): string {
  return manifest.entry_flow ?? "flow.json";
}

export function flowDocumentDigest(doc: FlowDocument): string {
  return JSON.stringify({ flow: doc.graph, variables: doc.variables });
}
