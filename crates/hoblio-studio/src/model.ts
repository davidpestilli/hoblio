import { defaultOutputVariableName } from "./actionOutputDefaults";

export type NodeKind =
  | "start"
  | "action"
  | "end"
  | "if"
  | "for_each"
  | "while_loop"
  | "repeat"
  | "next_loop"
  | "exit_loop";

export type CompareOperator = "eq" | "ne" | "contains" | "gt" | "gte" | "lt" | "lte";

export type ControlKind =
  | { type: "if"; left: string; operator: CompareOperator; right: string; ignore_case?: boolean }
  | { type: "for_each"; list_variable: string; item_variable: string }
  | { type: "while"; left: string; operator: CompareOperator; right: string; ignore_case?: boolean }
  | { type: "repeat"; times: string; index_variable: string };

export type EdgePort = "main" | "then" | "else" | "body" | "after";

export type ActionKind =
  | { type: "log"; message: string }
  | { type: "no_op" }
  | { type: "browser_navigate"; url: string; wait_ms?: number }
  | {
      type: "browser_click";
      selector: string;
      timeout_ms?: number;
      wait_for_navigation?: boolean;
      wait_selector_after?: string;
      wait_after_timeout_ms?: number;
    }
  | { type: "browser_wait_navigation"; timeout_ms?: number }
  | { type: "browser_fill"; selector: string; text: string; timeout_ms?: number }
  | { type: "browser_wait_for"; selector: string; timeout_ms?: number }
  | { type: "browser_get_text"; selector: string; timeout_ms?: number; variable?: string }
  | { type: "set_variable"; variable: string; value: string }
  | { type: "increase_variable"; variable: string; amount?: string }
  | { type: "decrease_variable"; variable: string; amount?: string }
  | { type: "file_write"; path: string; content: string }
  | { type: "file_append"; path: string; content: string }
  | { type: "file_read"; path: string; variable: string }
  | { type: "list_append"; list_variable: string; item: string }
  | { type: "list_clear"; list_variable: string }
  | { type: "delay"; milliseconds: number }
  | { type: "http_get"; url: string }
  | { type: "show_message"; title: string; text: string; timeout_seconds?: number };

export type DefaultActionOptions = {
  takenNames?: Set<string>;
};

export type OnFailure = "stop" | "continue";

export type ErrorHandling = {
  retry_count?: number;
  retry_delay_ms?: number;
  on_failure?: OnFailure;
};

export interface FlowNode {
  id: string;
  kind: NodeKind;
  label?: string;
  action?: ActionKind;
  control?: ControlKind;
  error_handling?: ErrorHandling;
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
      { id: "end", kind: "end", label: "End", ui: { x: 720, y: 120 } },
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
    case "browser_wait_navigation":
      return "BrowserWaitNavigation";
    case "browser_fill":
      return "BrowserFill";
    case "browser_wait_for":
      return "BrowserWaitFor";
    case "browser_get_text":
      return "BrowserGetText";
    case "set_variable":
      return "SetVariable";
    case "increase_variable":
      return "IncreaseVariable";
    case "decrease_variable":
      return "DecreaseVariable";
    case "file_write":
      return "FileWrite";
    case "file_append":
      return "FileAppend";
    case "file_read":
      return "FileRead";
    case "list_append":
      return "ListAppend";
    case "list_clear":
      return "ListClear";
    case "delay":
      return "Delay";
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
    case "while_loop":
      return "While";
    case "repeat":
      return "Repeat";
    case "next_loop":
      return "NextLoop";
    case "exit_loop":
      return "ExitLoop";
    default:
      return kind;
  }
}

export function defaultControl(kind: "if" | "for_each" | "while_loop" | "repeat"): ControlKind {
  if (kind === "if") {
    return { type: "if", left: "{flag}", operator: "eq", right: "yes", ignore_case: true };
  }
  if (kind === "while_loop") {
    return { type: "while", left: "{counter}", operator: "lt", right: "4", ignore_case: false };
  }
  if (kind === "repeat") {
    return { type: "repeat", times: "4", index_variable: "LoopIndex" };
  }
  return { type: "for_each", list_variable: "items", item_variable: "item" };
}

export function defaultAction(
  type: ActionKind["type"],
  options?: DefaultActionOptions,
): ActionKind {
  const taken = options?.takenNames ?? new Set<string>();
  switch (type) {
    case "log":
      return { type: "log", message: "Hello" };
    case "no_op":
      return { type: "no_op" };
    case "browser_navigate":
      return { type: "browser_navigate", url: "https://example.com", wait_ms: 500 };
    case "browser_click":
      return {
        type: "browser_click",
        selector: "button",
        timeout_ms: 10000,
        wait_for_navigation: false,
      };
    case "browser_wait_navigation":
      return { type: "browser_wait_navigation", timeout_ms: 15000 };
    case "browser_fill":
      return { type: "browser_fill", selector: "input", text: "", timeout_ms: 10000 };
    case "browser_wait_for":
      return { type: "browser_wait_for", selector: "h1", timeout_ms: 10000 };
    case "browser_get_text": {
      const variable = defaultOutputVariableName("browser_get_text", taken);
      return {
        type: "browser_get_text",
        selector: "h1",
        timeout_ms: 10000,
        ...(variable ? { variable } : {}),
      };
    }
    case "set_variable": {
      const variable = defaultOutputVariableName("set_variable", taken) ?? "Var1";
      return { type: "set_variable", variable, value: "" };
    }
    case "increase_variable":
      return { type: "increase_variable", variable: "counter" };
    case "decrease_variable":
      return { type: "decrease_variable", variable: "counter" };
    case "file_write":
      return { type: "file_write", path: "output/report.txt", content: "Hello from Hoblio\n" };
    case "file_append":
      return { type: "file_append", path: "output/report.txt", content: "line\n" };
    case "file_read": {
      const variable = defaultOutputVariableName("file_read", taken) ?? "FileContent1";
      return { type: "file_read", path: "output/report.txt", variable };
    }
    case "list_append":
      return { type: "list_append", list_variable: "items", item: "item" };
    case "list_clear":
      return { type: "list_clear", list_variable: "items" };
    case "delay":
      return { type: "delay", milliseconds: 1000 };
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
  patch: {
    selector?: string;
    timeout_ms?: number;
    text?: string;
    variable?: string;
    wait_for_navigation?: boolean;
    wait_selector_after?: string;
    wait_after_timeout_ms?: number;
  },
  type: ActionKind["type"]
): ActionKind {
  const timeout_ms = patch.timeout_ms;
  const selector = patch.selector ?? "h1";
  switch (type) {
    case "browser_click":
      return {
        type: "browser_click",
        selector,
        timeout_ms,
        wait_for_navigation:
          patch.wait_for_navigation ??
          (current.type === "browser_click" ? current.wait_for_navigation : undefined),
        wait_selector_after:
          patch.wait_selector_after ??
          (current.type === "browser_click" ? current.wait_selector_after : undefined),
        wait_after_timeout_ms:
          patch.wait_after_timeout_ms ??
          (current.type === "browser_click" ? current.wait_after_timeout_ms : undefined),
      };
    case "browser_wait_navigation":
      return { type: "browser_wait_navigation", timeout_ms };
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
