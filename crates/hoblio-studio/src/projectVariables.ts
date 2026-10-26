export type ScalarKind = "text" | "number" | "boolean";

export type ScalarEntry = {
  name: string;
  kind: ScalarKind;
  value: string | number | boolean;
};

export type ListEntry = {
  name: string;
  items: string[];
};

const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function isValidVariableName(name: string): boolean {
  return name.length > 0 && NAME_RE.test(name);
}

export function parseVariablesObject(
  text: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, value: {} };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Variables must be a JSON object." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }
}

export function variablesToJson(variables: Record<string, unknown>): string {
  try {
    return JSON.stringify(variables, null, 2);
  } catch {
    return "{}";
  }
}

function inferScalarKind(value: unknown): ScalarKind {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "text";
}

function scalarFromValue(name: string, value: unknown): ScalarEntry {
  const kind = inferScalarKind(value);
  if (kind === "boolean") {
    return { name, kind, value: Boolean(value) };
  }
  if (kind === "number" && typeof value === "number") {
    return { name, kind, value };
  }
  return { name, kind: "text", value: value == null ? "" : String(value) };
}

export function partitionVariables(variables: Record<string, unknown>): {
  scalars: ScalarEntry[];
  lists: ListEntry[];
  otherKeys: string[];
} {
  const scalars: ScalarEntry[] = [];
  const lists: ListEntry[] = [];
  const otherKeys: string[] = [];

  const names = Object.keys(variables);
  for (const name of names) {
    const value = variables[name];
    if (Array.isArray(value)) {
      lists.push({
        name,
        items: value.map((item) => (item == null ? "" : String(item))),
      });
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      scalars.push(scalarFromValue(name, value));
    } else {
      otherKeys.push(name);
    }
  }

  return { scalars, lists, otherKeys };
}

export function buildVariables(
  scalars: ScalarEntry[],
  lists: ListEntry[],
  base: Record<string, unknown>,
): Record<string, unknown> {
  const otherKeys = partitionVariables(base).otherKeys;
  const out: Record<string, unknown> = {};
  for (const key of otherKeys) {
    out[key] = base[key];
  }

  for (const entry of scalars) {
    const name = entry.name.trim();
    if (!name) continue;
    if (entry.kind === "boolean") {
      out[name] = entry.value === true;
    } else if (entry.kind === "number") {
      const n = typeof entry.value === "number" ? entry.value : Number(entry.value);
      out[name] = Number.isFinite(n) ? n : 0;
    } else {
      out[name] = String(entry.value);
    }
  }

  for (const entry of lists) {
    const name = entry.name.trim();
    if (!name) continue;
    out[name] = entry.items.map((item) => item);
  }

  return out;
}

export function listVariableNames(variables: Record<string, unknown>): string[] {
  return Object.keys(variables).filter((key) => Array.isArray(variables[key]));
}

export function scalarVariableNames(variables: Record<string, unknown>): string[] {
  return Object.keys(variables).filter((key) => {
    const v = variables[key];
    return (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null
    );
  });
}

export function uniqueVariableName(prefix: string, taken: Set<string>): string {
  let i = 1;
  while (taken.has(`${prefix}${i}`)) {
    i += 1;
  }
  return `${prefix}${i}`;
}
