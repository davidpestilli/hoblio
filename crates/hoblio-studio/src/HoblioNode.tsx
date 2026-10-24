import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { HoblioNodeData } from "./flowConvert";
import { actionLabel } from "./model";

const SIDES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

export function HoblioNode({ data, selected }: NodeProps<HoblioNodeData>) {
  const n = data.flowNode;
  const subtitle =
    n.kind === "action" && n.action ? actionLabel(n.action) : n.kind.toUpperCase();
  const active = data.active;

  const showTarget = n.kind !== "start";
  const showSource = n.kind !== "end";

  return (
    <div
      className={`hoblio-node ${selected ? "selected" : ""} ${active ? "active" : ""} kind-${n.kind}`}
    >
      {SIDES.map(({ id, position }) =>
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
      {SIDES.map(({ id, position }) =>
        showSource ? (
          <Handle
            key={`source-${id}`}
            id={id}
            type="source"
            position={position}
            className="hoblio-handle hoblio-handle-source"
          />
        ) : null,
      )}
      <div className="hoblio-node-title">{n.label ?? n.id}</div>
      <div className="hoblio-node-sub">{subtitle}</div>
    </div>
  );
}
