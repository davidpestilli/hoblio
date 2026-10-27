export type RunEvent =
  | { kind: "run_started"; project: string }
  | { kind: "node_enter"; node_id: string }
  | { kind: "node_exit"; node_id: string }
  | {
      kind: "action_executed";
      node_id: string;
      summary: string;
      variables?: Record<string, string>;
    }
  | { kind: "run_finished"; last_node: string };

export type LogLine = {
  id: number;
  event: RunEvent;
  human: string;
  json: string;
};

let nextLogId = 0;

export function formatRunEvent(e: RunEvent): string {
  switch (e.kind) {
    case "run_started":
      return `run_started · project=${e.project}`;
    case "node_enter":
      return `node_enter · ${e.node_id}`;
    case "node_exit":
      return `node_exit · ${e.node_id}`;
    case "action_executed":
      return `action_executed · ${e.node_id} · ${e.summary}`;
    case "run_finished":
      return `run_finished · last=${e.last_node}`;
  }
}

export function logLineFromEvent(event: RunEvent): LogLine {
  return {
    id: nextLogId++,
    event,
    human: formatRunEvent(event),
    json: JSON.stringify(event),
  };
}

export function fullLogText(lines: LogLine[], showJson: boolean): string {
  return lines.map((l) => (showJson ? l.json : l.human)).join("\n");
}
