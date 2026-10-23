import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { HoblioNodeData } from "./flowConvert";
import { actionLabel } from "./model";

export function HoblioNode({ data, selected }: NodeProps<HoblioNodeData>) {
  const n = data.flowNode;
  const subtitle =
    n.kind === "action" && n.action ? actionLabel(n.action) : n.kind.toUpperCase();
  const active = data.active;

  return (
    <div
      className={`hoblio-node ${selected ? "selected" : ""} ${active ? "active" : ""} kind-${n.kind}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="hoblio-node-title">{n.label ?? n.id}</div>
      <div className="hoblio-node-sub">{subtitle}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
