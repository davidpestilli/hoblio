import type { ActionKind, FlowNode } from "./model";
import { isValidVariableName } from "./projectVariables";

export type FlowVariableKind = "text" | "list" | "loop_item";

export type FlowVariableProducer = {
  name: string;
  kind: FlowVariableKind;
  nodeId: string;
  nodeLabel: string;
  source: string;
};

const TEMPLATE_VAR = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

function nodeTitle(node: FlowNode): string {
  return node.label?.trim() || node.id;
}

function producerFromAction(node: FlowNode, action: ActionKind): FlowVariableProducer[] {
  switch (action.type) {
    case "browser_get_text": {
      const name = action.variable?.trim();
      if (!name) return [];
      return [
        {
          name,
          kind: "text",
          nodeId: node.id,
          nodeLabel: nodeTitle(node),
          source: "BrowserGetText",
        },
      ];
    }
    case "set_variable": {
      const name = action.variable.trim();
      if (!name) return [];
      return [
        {
          name,
          kind: "text",
          nodeId: node.id,
          nodeLabel: nodeTitle(node),
          source: "SetVariable",
        },
      ];
    }
    case "file_read": {
      const name = action.variable.trim();
      if (!name) return [];
      return [
        {
          name,
          kind: "text",
          nodeId: node.id,
          nodeLabel: nodeTitle(node),
          source: "FileRead",
        },
      ];
    }
    case "show_get_user_input": {
      const producers: FlowVariableProducer[] = [];
      const user = action.user_input_variable.trim();
      if (user) {
        producers.push({
          name: user,
          kind: "text",
          nodeId: node.id,
          nodeLabel: nodeTitle(node),
          source: "ShowGetUserInput (UserInput)",
        });
      }
      const button = action.button_pressed_variable.trim();
      if (button) {
        producers.push({
          name: button,
          kind: "text",
          nodeId: node.id,
          nodeLabel: nodeTitle(node),
          source: "ShowGetUserInput (ButtonPressed)",
        });
      }
      return producers;
    }
    default:
      return [];
  }
}

export function collectFlowVariableProducers(nodes: FlowNode[]): FlowVariableProducer[] {
  const out: FlowVariableProducer[] = [];
  for (const node of nodes) {
    if (node.action) {
      out.push(...producerFromAction(node, node.action));
    }
    if (node.control?.type === "for_each") {
      const name = node.control.item_variable.trim();
      if (name) {
        out.push({
          name,
          kind: "loop_item",
          nodeId: node.id,
          nodeLabel: nodeTitle(node),
          source: "ForEach (item)",
        });
      }
    }
    if (node.control?.type === "repeat") {
      const name = node.control.index_variable.trim();
      if (name) {
        out.push({
          name,
          kind: "loop_item",
          nodeId: node.id,
          nodeLabel: nodeTitle(node),
          source: "Repeat (index)",
        });
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function collectTakenVariableNames(
  nodes: FlowNode[],
  seedVariables: Record<string, unknown>,
): Set<string> {
  const taken = new Set(Object.keys(seedVariables));
  for (const producer of collectFlowVariableProducers(nodes)) {
    taken.add(producer.name);
  }
  return taken;
}

function replaceTemplateVars(text: string, oldName: string, newName: string): string {
  if (oldName === newName || !text.includes("{")) return text;
  return text.replace(TEMPLATE_VAR, (match, name: string) =>
    name === oldName ? `{${newName}}` : match,
  );
}

function patchActionRename(
  action: ActionKind,
  oldName: string,
  newName: string,
): ActionKind {
  switch (action.type) {
    case "log":
      return { ...action, message: replaceTemplateVars(action.message, oldName, newName) };
    case "browser_fill":
      return { ...action, text: replaceTemplateVars(action.text, oldName, newName) };
    case "show_message":
      return {
        ...action,
        title: replaceTemplateVars(action.title, oldName, newName),
        text: replaceTemplateVars(action.text, oldName, newName),
      };
    case "show_get_user_input":
      return {
        ...action,
        title: replaceTemplateVars(action.title, oldName, newName),
        message: replaceTemplateVars(action.message, oldName, newName),
        default_value: action.default_value
          ? replaceTemplateVars(action.default_value, oldName, newName)
          : undefined,
        user_input_variable:
          action.user_input_variable === oldName ? newName : action.user_input_variable,
        button_pressed_variable:
          action.button_pressed_variable === oldName ? newName : action.button_pressed_variable,
      };
    case "set_variable":
      return {
        ...action,
        variable: action.variable === oldName ? newName : action.variable,
        value: replaceTemplateVars(action.value, oldName, newName),
      };
    case "increase_variable":
    case "decrease_variable":
      return {
        ...action,
        variable: action.variable === oldName ? newName : action.variable,
        amount: action.amount
          ? replaceTemplateVars(action.amount, oldName, newName)
          : undefined,
      };
    case "browser_get_text":
      return {
        ...action,
        variable: action.variable === oldName ? newName : action.variable,
      };
    case "file_read":
      return {
        ...action,
        path: replaceTemplateVars(action.path, oldName, newName),
        variable: action.variable === oldName ? newName : action.variable,
      };
    case "file_append":
    case "file_write":
      return {
        ...action,
        path: replaceTemplateVars(action.path, oldName, newName),
        content: replaceTemplateVars(action.content, oldName, newName),
      };
    case "list_append":
      return {
        ...action,
        list_variable:
          action.list_variable === oldName ? newName : action.list_variable,
        item: replaceTemplateVars(action.item, oldName, newName),
      };
    case "list_clear":
      return {
        ...action,
        list_variable:
          action.list_variable === oldName ? newName : action.list_variable,
      };
    default:
      return action;
  }
}

export function renameVariableInFlowNodes(
  nodes: FlowNode[],
  oldName: string,
  newName: string,
): FlowNode[] {
  if (!oldName || !newName || oldName === newName) return nodes;
  return nodes.map((node) => {
    let next = node;
    if (node.action) {
      const action = patchActionRename(node.action, oldName, newName);
      if (action !== node.action) {
        next = { ...next, action };
      }
    }
    if (node.control?.type === "if" || node.control?.type === "while") {
      next = {
        ...next,
        control: {
          ...node.control,
          left: replaceTemplateVars(node.control.left, oldName, newName),
          right: replaceTemplateVars(node.control.right, oldName, newName),
        },
      };
    }
    if (node.control?.type === "repeat") {
      const index_variable =
        node.control.index_variable === oldName ? newName : node.control.index_variable;
      next = {
        ...next,
        control: {
          ...node.control,
          times: replaceTemplateVars(node.control.times, oldName, newName),
          index_variable,
        },
      };
    }
    if (node.control?.type === "for_each") {
      const list_variable =
        node.control.list_variable === oldName ? newName : node.control.list_variable;
      const item_variable =
        node.control.item_variable === oldName ? newName : node.control.item_variable;
      if (
        list_variable !== node.control.list_variable ||
        item_variable !== node.control.item_variable
      ) {
        next = {
          ...next,
          control: { ...node.control, list_variable, item_variable },
        };
      }
    }
    return next;
  });
}

export function renameVariableInSeed(
  variables: Record<string, unknown>,
  oldName: string,
  newName: string,
): Record<string, unknown> {
  if (!oldName || !newName || oldName === newName || !(oldName in variables)) {
    return variables;
  }
  const { [oldName]: value, ...rest } = variables;
  if (newName in rest) {
    return variables;
  }
  return { ...rest, [newName]: value };
}

export function scalarNamesForPicker(
  seedVariables: Record<string, unknown>,
  nodes: FlowNode[],
): string[] {
  const names = new Set<string>();
  for (const key of Object.keys(seedVariables)) {
    const v = seedVariables[key];
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null
    ) {
      names.add(key);
    }
  }
  for (const producer of collectFlowVariableProducers(nodes)) {
    if (producer.kind === "text" || producer.kind === "loop_item") {
      names.add(producer.name);
    }
  }
  return [...names].sort();
}

export function validateProducerName(name: string): string | null {
  if (!name.trim()) return "Name is required";
  if (!isValidVariableName(name)) return "Use letters, digits, and underscore only";
  return null;
}
