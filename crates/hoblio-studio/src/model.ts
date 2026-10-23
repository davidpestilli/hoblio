export type NodeKind = "start" | "action" | "end";

export type ActionKind =
  | { type: "log"; message: string }
  | { type: "no_op" }
  | { type: "browser_navigate"; url: string; wait_ms?: number }
  | { type: "file_write"; path: string; content: string }
  | { type: "http_get"; url: string };

export interface FlowNode {
  id: string;
  kind: NodeKind;
  label?: string;
  action?: ActionKind;
  ui?: { x: number; y: number };
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowGraph {
  start: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowManifest {
  name: string;
  version: string;
  description?: string;
}

export interface FlowProject {
  manifest: FlowManifest;
  flow: FlowGraph;
  variables: Record<string, unknown>;
}

export const defaultProject = (): FlowProject => ({
  manifest: {
    name: "untitled",
    version: "0.1.0",
    description: "New Hoblio flow",
  },
  flow: {
    start: "start",
    nodes: [
      { id: "start", kind: "start", label: "Start", ui: { x: 80, y: 120 } },
      { id: "end", kind: "end", label: "End", ui: { x: 480, y: 120 } },
    ],
    edges: [{ from: "start", to: "end" }],
  },
  variables: {},
});

export function actionLabel(action: ActionKind): string {
  switch (action.type) {
    case "log":
      return "Log";
    case "no_op":
      return "NoOp";
    case "browser_navigate":
      return "Browser";
    case "file_write":
      return "FileWrite";
    case "http_get":
      return "HttpGet";
  }
}

export function defaultAction(type: ActionKind["type"]): ActionKind {
  switch (type) {
    case "log":
      return { type: "log", message: "Hello" };
    case "no_op":
      return { type: "no_op" };
    case "browser_navigate":
      return { type: "browser_navigate", url: "https://example.com", wait_ms: 500 };
    case "file_write":
      return { type: "file_write", path: "output.txt", content: "Hello from Hoblio" };
    case "http_get":
      return { type: "http_get", url: "https://example.com" };
  }
}
