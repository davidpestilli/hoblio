export type NodeKind =
  | "start"
  | "action"
  | "end"
  | "if"
  | "for_each"
  | "next_loop"
  | "exit_loop";

export type CompareOperator = "eq" | "ne" | "contains";

export type ControlKind =
  | { type: "if"; left: string; operator: CompareOperator; right: string; ignore_case?: boolean }
  | { type: "for_each"; list_variable: string; item_variable: string };

export type EdgePort = "main" | "then" | "else" | "body" | "after";

export type ActionKind =
  | { type: "log"; message: string }
  | { type: "no_op" }
  | { type: "browser_navigate"; url: string; wait_ms?: number }
  | { type: "browser_click"; selector: string; timeout_ms?: number }
  | { type: "browser_fill"; selector: string; text: string; timeout_ms?: number }
  | { type: "browser_wait_for"; selector: string; timeout_ms?: number }
  | { type: "browser_get_text"; selector: string; timeout_ms?: number; variable?: string }
  | { type: "file_write"; path: string; content: string }
  | { type: "http_get"; url: string }
  | { type: "show_message"; title: string; text: string; timeout_seconds?: number };

export interface FlowNode {
  id: string;
  kind: NodeKind;
  label?: string;
  action?: ActionKind;
  control?: ControlKind;
  ui?: { x: number; y: number };
}

export interface Waypoint {
  x: number;
  y: number;
}

export interface FlowEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  port?: EdgePort;
  ui?: {
    waypoints?: Waypoint[];
    sourceHandle?: string;
    targetHandle?: string;
  };
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
      return "BrowserNavigate";
    case "browser_click":
      return "BrowserClick";
    case "browser_fill":
      return "BrowserFill";
    case "browser_wait_for":
      return "BrowserWaitFor";
    case "browser_get_text":
      return "BrowserGetText";
    case "file_write":
      return "FileWrite";
    case "http_get":
      return "HttpGet";
    case "show_message":
      return "ShowMessage";
  }
}

export function controlLabel(kind: NodeKind): string {
  switch (kind) {
    case "if":
      return "If";
    case "for_each":
      return "ForEach";
    case "next_loop":
      return "NextLoop";
    case "exit_loop":
      return "ExitLoop";
    default:
      return kind;
  }
}

export function defaultControl(kind: "if" | "for_each"): ControlKind {
  if (kind === "if") {
    return { type: "if", left: "{flag}", operator: "eq", right: "yes", ignore_case: true };
  }
  return { type: "for_each", list_variable: "items", item_variable: "item" };
}

export function defaultAction(type: ActionKind["type"]): ActionKind {
  switch (type) {
    case "log":
      return { type: "log", message: "Hello" };
    case "no_op":
      return { type: "no_op" };
    case "browser_navigate":
      return { type: "browser_navigate", url: "https://example.com", wait_ms: 500 };
    case "browser_click":
      return { type: "browser_click", selector: "button", timeout_ms: 10000 };
    case "browser_fill":
      return { type: "browser_fill", selector: "input", text: "", timeout_ms: 10000 };
    case "browser_wait_for":
      return { type: "browser_wait_for", selector: "h1", timeout_ms: 10000 };
    case "browser_get_text":
      return { type: "browser_get_text", selector: "h1", timeout_ms: 10000 };
    case "file_write":
      return { type: "file_write", path: "output.txt", content: "Hello from Hoblio" };
    case "http_get":
      return { type: "http_get", url: "https://example.com" };
    case "show_message":
      return {
        type: "show_message",
        title: "Hoblio",
        text: "Mensagem de exemplo",
        timeout_seconds: 2,
      };
  }
}

/** Shared fields for browser DOM actions (not navigate). */
export function patchBrowserDomAction(
  current: ActionKind,
  patch: { selector?: string; timeout_ms?: number; text?: string; variable?: string },
  type: ActionKind["type"]
): ActionKind {
  const timeout_ms = patch.timeout_ms;
  const selector = patch.selector ?? "h1";
  switch (type) {
    case "browser_click":
      return { type: "browser_click", selector, timeout_ms };
    case "browser_fill":
      return {
        type: "browser_fill",
        selector,
        text: patch.text ?? (current.type === "browser_fill" ? current.text : ""),
        timeout_ms,
      };
    case "browser_wait_for":
      return { type: "browser_wait_for", selector, timeout_ms };
    case "browser_get_text":
      return {
        type: "browser_get_text",
        selector,
        timeout_ms,
        variable:
          patch.variable ??
          (current.type === "browser_get_text" ? current.variable : undefined),
      };
    default:
      return current;
  }
}
