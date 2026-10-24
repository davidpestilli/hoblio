import { createContext, useContext } from "react";

import type { Waypoint } from "../model";

export interface FlowEditorApi {
  editing: boolean;
  setEdgeWaypoints: (edgeId: string, waypoints: Waypoint[]) => void;
  commitHistory: () => void;
}

const FlowEditorContext = createContext<FlowEditorApi>({
  editing: false,
  setEdgeWaypoints: () => undefined,
  commitHistory: () => undefined,
});

export const FlowEditorProvider = FlowEditorContext.Provider;

export function useFlowEditor(): FlowEditorApi {
  return useContext(FlowEditorContext);
}
