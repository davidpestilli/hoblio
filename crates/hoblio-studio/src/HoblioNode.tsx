import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { HoblioNodeData } from "./flowConvert";
import { actionLabel, controlLabel } from "./model";

type SideSpec = {
  sideId: string;
  position: Position;
  sourceId?: string;
  sourceClassName?: string;
  target: boolean;
  source: boolean;
};

const CENTER_TOP_BOTTOM: CSSProperties = { left: "50%" };
const CENTER_LEFT_RIGHT: CSSProperties = { top: "50%" };

function centerStyle(position: Position): CSSProperties | undefined {
  if (position === Position.Top || position === Position.Bottom) {
    return CENTER_TOP_BOTTOM;
  }
  if (position === Position.Left || position === Position.Right) {
    return CENTER_LEFT_RIGHT;
  }
  return undefined;
}

function sideSpecs(kind: string, showTarget: boolean, showSource: boolean): SideSpec[] {
  const io = (sideId: string, position: Position): SideSpec => ({
    sideId,
    position,
    sourceId: sideId,
    target: showTarget,
    source: showSource,
  });

  switch (kind) {
    case "if":
      return [
        { sideId: "top", position: Position.Top, target: showTarget, source: false },
        { sideId: "left", position: Position.Left, target: showTarget, source: false },
        {
          sideId: "right",
          position: Position.Right,
          sourceId: "then",
          sourceClassName: "port-then",
          target: showTarget,
          source: showSource,
        },
        {
          sideId: "bottom",
          position: Position.Bottom,
          sourceId: "else",
          sourceClassName: "port-else",
          target: showTarget,
          source: showSource,
        },
      ];
    case "for_each":
    case "while_loop":
    case "repeat":
      return [
        { sideId: "top", position: Position.Top, target: showTarget, source: false },
        { sideId: "left", position: Position.Left, target: showTarget, source: false },
        {
          sideId: "right",
          position: Position.Right,
          sourceId: "body",
          sourceClassName: "port-body",
          target: showTarget,
          source: showSource,
        },
        {
          sideId: "bottom",
          position: Position.Bottom,
          sourceId: "after",
          sourceClassName: "port-after",
          target: showTarget,
          source: showSource,
        },
      ];
    default:
      return [
        io("top", Position.Top),
        io("right", Position.Right),
        io("bottom", Position.Bottom),
        io("left", Position.Left),
      ];
  }
}

function SideHandles({ spec }: { spec: SideSpec }) {
  const style = centerStyle(spec.position);

  return (
    <>
      {spec.target ? (
        <Handle
          key={`target-${spec.sideId}`}
          id={spec.sideId}
          type="target"
          position={spec.position}
          style={style}
          className="hoblio-handle hoblio-handle-io hoblio-handle-layer-target"
        />
      ) : null}
      {spec.source ? (
        <Handle
          key={`source-${spec.sourceId}`}
          id={spec.sourceId!}
          type="source"
          position={spec.position}
          style={style}
          className={`hoblio-handle hoblio-handle-io hoblio-handle-source hoblio-handle-layer-source ${spec.sourceClassName ?? ""}`}
        />
      ) : null}
    </>
  );
}

export function HoblioNode(props: NodeProps<Node<HoblioNodeData>>) {
  const data = props.data as HoblioNodeData;
  const n = data.flowNode;
  const subtitle =
    n.kind === "action" && n.action
      ? actionLabel(n.action)
      : n.kind === "if" ||
          n.kind === "for_each" ||
          n.kind === "while_loop" ||
          n.kind === "repeat"
        ? controlLabel(n.kind)
        : n.kind === "next_loop" || n.kind === "exit_loop"
          ? controlLabel(n.kind)
          : n.kind.toUpperCase();
  const active = data.active;

  const showTarget = n.kind !== "start";
  const showSource = n.kind !== "end";
  const sides = sideSpecs(n.kind, showTarget, showSource);

  return (
    <div
      className={`hoblio-node ${props.selected ? "selected" : ""} ${active ? "active" : ""} kind-${n.kind}`}
    >
      {sides.map((spec) => (
        <SideHandles key={spec.sideId} spec={spec} />
      ))}
      <div className="hoblio-node-title">{n.label ?? n.id}</div>
      <div className="hoblio-node-sub">{subtitle}</div>
      {n.kind === "if" && (
        <div className="hoblio-node-ports">
          <span className="port-label port-then-label">then →</span>
          <span className="port-label port-else-label">else ↓</span>
        </div>
      )}
      {(n.kind === "for_each" || n.kind === "while_loop" || n.kind === "repeat") && (
        <div className="hoblio-node-ports">
          <span className="port-label port-body-label">body →</span>
          <span className="port-label port-after-label">after ↓</span>
        </div>
      )}
    </div>
  );
}
