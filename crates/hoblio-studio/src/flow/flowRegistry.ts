import type { EdgeTypes, NodeTypes } from "@xyflow/react";

import { HoblioNode } from "../HoblioNode";
import { WaypointEdge } from "./WaypointEdge";

export const nodeTypes: NodeTypes = { hoblio: HoblioNode };
export const edgeTypes: EdgeTypes = { waypoint: WaypointEdge };
