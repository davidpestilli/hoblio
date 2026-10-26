import { uniqueVariableName } from "./projectVariables";

const OUTPUT_PREFIX: Record<string, string> = {
  browser_get_text: "BrowserText",
  set_variable: "Var",
};

export function defaultOutputVariableName(
  actionType: string,
  taken: Set<string>,
): string | undefined {
  const prefix = OUTPUT_PREFIX[actionType];
  if (!prefix) return undefined;
  return uniqueVariableName(prefix, taken);
}
