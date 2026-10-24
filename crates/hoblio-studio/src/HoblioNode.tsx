import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { HoblioNodeData } from "./flowConvert";
import { actionLabel, controlLabel } from "./model";

const TARGET_SIDES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

type SourceHandle = { id: string; position: Position; className?: string };

function sourceHandles(kind: string): SourceHandle[] {
  switch (kind) {
    case "if":
      return [
        { id: "then", position: Position.Right, className: "port-then" },
        { id: "else", position: Position.Bottom, className: "port-else" },
      ];
    case "for_each":
      return [
        { id: "body", position: Position.Right, className: "port-body" },
        { id: "after", position: Position.Bottom, className: "port-after" },
      ];
    default:
      return [{ id: "right", position: Position.Right }];
  }
}

export function HoblioNode(props: NodeProps<Node<HoblioNodeData>>) {
  const data = props.data as HoblioNodeData;
  const n = data.flowNode;
  const subtitle =
    n.kind === "action" && n.action
      ? actionLabel(n.action)
      : n.kind === "if" || n.kind === "for_each"
        ? controlLabel(n.kind)
        : n.kind === "next_loop" || n.kind === "exit_loop"
          ? controlLabel(n.kind)
          : n.kind.toUpperCase();
  const active = data.active;

  const showTarget = n.kind !== "start";
  const showSource = n.kind !== "end";
  const sources = sourceHandles(n.kind);

  return (
    <div
      className={`hoblio-node ${props.selected ? "selected" : ""} ${active ? "active" : ""} kind-${n.kind}`}
    >
      {TARGET_SIDES.map(({ id, position }) =>
        showTarget ? (
          <Handle
            key={`target-${id}`}
            id={id}
            type="target"
            position={position}
            className="hoblio-handle hoblio-handle-target"
          />
        ) : null,
      )}
      {showSource
        ? sources.map(({ id, position, className }) => (
            <Handle
              key={`source-${id}`}
              id={id}
              type="source"
              position={position}
              className={`hoblio-handle hoblio-handle-source ${className ?? ""}`}
            />
          ))
        : null}
      <div className="hoblio-node-title">{n.label ?? n.id}</div>
      <div className="hoblio-node-sub">{subtitle}</div>
      {n.kind === "if" && (
        <div className="hoblio-node-ports">
          <span className="port-label port-then-label">then →</span>
          <span className="port-label port-else-label">else ↓</span>
        </div>
      )}
      {n.kind === "for_each" && (
        <div className="hoblio-node-ports">
          <span className="port-label port-body-label">body →</span>
          <span className="port-label port-after-label">after ↓</span>
        </div>
      )}
    </div>
  );
}
