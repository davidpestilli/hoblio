import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { useCallback, useMemo, type PointerEvent as ReactPointerEvent } from "react";

import { useFlowEditor } from "./flowContext";
import { pathMidpoint } from "./flowLayout";
import type { HoblioFlowEdge } from "./flowTypes";
import type { Waypoint } from "../model";

const NO_WAYPOINTS: Waypoint[] = [];

const handleStyle = {
  position: "absolute" as const,
  width: 11,
  height: 11,
  borderRadius: 9999,
  border: "2px solid #ffffff",
  background: "#2563eb",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.35)",
  cursor: "grab",
  pointerEvents: "all" as const,
};

const insertStyle = {
  position: "absolute" as const,
  width: 14,
  height: 14,
  borderRadius: 9999,
  border: "1px dashed #2563eb",
  background: "#ffffff",
  color: "#2563eb",
  fontSize: 10,
  lineHeight: "11px",
  textAlign: "center" as const,
  cursor: "copy",
  pointerEvents: "all" as const,
};

export function WaypointEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  selected,
  data,
}: EdgeProps<HoblioFlowEdge>) {
  const { editing, setEdgeWaypoints, commitHistory } = useFlowEditor();
  const { screenToFlowPosition } = useReactFlow();
  const waypoints = data?.waypoints ?? NO_WAYPOINTS;

  const [path, labelX, labelY] = useMemo(() => {
    if (waypoints.length === 0) {
      return getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 14,
      });
    }
    const points: Waypoint[] = [
      { x: sourceX, y: sourceY },
      ...waypoints,
      { x: targetX, y: targetY },
    ];
    const pathData = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x},${point.y}`)
      .join(" ");
    const middle = pathMidpoint(points);
    return [pathData, middle.x, middle.y] as const;
  }, [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, waypoints]);

  const dragWaypoint = useCallback(
    (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      const snapshot = waypoints;
      const move = (moveEvent: PointerEvent) => {
        const position = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
        setEdgeWaypoints(
          id,
          snapshot.map((point, pointIndex) =>
            pointIndex === index ? { x: position.x, y: position.y } : point,
          ),
        );
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        commitHistory();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    },
    [commitHistory, id, screenToFlowPosition, setEdgeWaypoints, waypoints],
  );

  const points: Waypoint[] = [
    { x: sourceX, y: sourceY },
    ...waypoints,
    { x: targetX, y: targetY },
  ];
  const showTools = editing && Boolean(selected);

  return (
    <>
      {selected ? (
        <path
          d={path}
          fill="none"
          stroke="#2563eb"
          strokeOpacity={0.3}
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      ) : null}
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        {label ? (
          <div
            className={`flow-edge-label ${selected ? "selected" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        ) : null}
        {showTools
          ? points.map((point, index) =>
              index === 0 || index === points.length - 1 ? null : (
                <div
                  key={`waypoint-${id}-${index}`}
                  role="button"
                  tabIndex={-1}
                  title="Arraste para ajustar · duplo clique para remover"
                  onPointerDown={(event) => dragWaypoint(index - 1, event)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setEdgeWaypoints(
                      id,
                      waypoints.filter((_, pointIndex) => pointIndex !== index - 1),
                    );
                    commitHistory();
                  }}
                  style={{
                    ...handleStyle,
                    transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
                  }}
                />
              ),
            )
          : null}
        {showTools
          ? points.map((point, index) => {
              if (index >= points.length - 1) {
                return null;
              }
              const next = points[index + 1];
              const middle = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
              return (
                <div
                  key={`insert-${id}-${index}`}
                  role="button"
                  tabIndex={-1}
                  title="Clique para criar um ponto de passagem"
                  onClick={(event) => {
                    event.stopPropagation();
                    const nextWaypoints = [...waypoints];
                    nextWaypoints.splice(index, 0, middle);
                    setEdgeWaypoints(id, nextWaypoints);
                    commitHistory();
                  }}
                  style={{
                    ...insertStyle,
                    transform: `translate(-50%, -50%) translate(${middle.x}px, ${middle.y}px)`,
                  }}
                >
                  +
                </div>
              );
            })
          : null}
      </EdgeLabelRenderer>
    </>
  );
}
