import type { NodeTypes } from "@xyflow/react";

import { HoblioNode } from "../HoblioNode";
import { WaypointEdge } from "./WaypointEdge";

export const nodeTypes = {
  hoblio: HoblioNode,
} satisfies NodeTypes;

export const edgeTypes = { waypoint: WaypointEdge };
