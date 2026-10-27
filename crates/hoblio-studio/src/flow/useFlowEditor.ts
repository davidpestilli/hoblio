import {
  addEdge,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  flowToGraph,
  graphToFlow,
  newActionNodeId,
  parseEdgePort,
  sourceHandleKey,
} from "../flowConvert";
import type { ActionKind, FlowGraph, FlowNode, FlowProject, NodeKind } from "../model";
import { collectTakenVariableNames, renameVariableInFlowNodes } from "../flowVariables";
import { defaultAction, defaultControl } from "../model";
import type { HoblioFlowEdge, HoblioFlowNode } from "./flowTypes";
import { newEdgeId } from "./flowTypes";
import type { Waypoint } from "../model";

const HISTORY_LIMIT = 40;

/** Spread new nodes on a grid so control/action nodes do not stack on top of each other. */
function spawnPosition(index: number, baseX: number, baseY: number): { x: number; y: number } {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return { x: baseX + col * 200, y: baseY + row * 120 };
}

interface CanvasSnapshot {
  nodes: HoblioFlowNode[];
  edges: HoblioFlowEdge[];
  start: string;
}

interface HistoryState {
  items: CanvasSnapshot[];
  index: number;
}

function cloneSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return {
    start: snapshot.start,
    nodes: structuredClone(snapshot.nodes),
    edges: structuredClone(snapshot.edges),
  };
}

function snapshotsEqual(a: CanvasSnapshot, b: CanvasSnapshot): boolean {
  return (
    a.start === b.start &&
    JSON.stringify(a.nodes) === JSON.stringify(b.nodes) &&
    JSON.stringify(a.edges) === JSON.stringify(b.edges)
  );
}

function defaultEdge(connection: Connection, id: string): HoblioFlowEdge {
  const rawHandle =
    typeof connection.sourceHandle === "string" ? connection.sourceHandle : undefined;
  const port = parseEdgePort(rawHandle);
  const sourceHandle = port && port !== "main" ? port : rawHandle ?? "right";
  return {
    ...connection,
    id,
    type: "waypoint",
    sourceHandle,
    label: undefined,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    data: {
      flowEdge: {
        id,
        from: connection.source!,
        to: connection.target!,
        port,
        label: port && port !== "main" ? port : undefined,
      },
      waypoints: [],
    },
  };
}

export interface FlowEditorController {
  nodes: HoblioFlowNode[];
  edges: HoblioFlowEdge[];
  start: string;
  editing: boolean;
  setEditing: (value: boolean) => void;
  onNodesChange: OnNodesChange<HoblioFlowNode>;
  onEdgesChange: OnEdgesChange<HoblioFlowEdge>;
  onConnect: (connection: Connection) => void;
  onConnectEnd: (connectionState: FinalConnectionState) => void;
  onReconnect: (edge: HoblioFlowEdge, connection: Connection) => void;
  isValidConnection: (connection: Connection) => boolean;
  selectedEdgeId: string | null;
  selectEdge: (edgeId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  setEdgeLabel: (edgeId: string, label: string) => void;
  setEdgeWaypoints: (edgeId: string, waypoints: Waypoint[]) => void;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  commitHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  loadProject: (project: FlowProject) => void;
  fitViewToken: number;
  toFlowGraph: () => FlowGraph;
  onConnectionRejected?: (message: string) => void;
  addAction: (type: ActionKind["type"], seedVariables?: Record<string, unknown>) => void;
  applyVariableRename: (oldName: string, newName: string) => void;
  addControlNode: (
    kind: Extract<NodeKind, "if" | "for_each" | "while_loop" | "repeat" | "next_loop" | "exit_loop">,
  ) => void;
  addEndNode: () => void;
  deleteSelection: () => void;
  deleteNode: (nodeId: string) => void;
  updateFlowNode: (flowNode: FlowNode, options?: { recordHistory?: boolean }) => void;
}

export function useFlowEditor(
  initialProject: FlowProject,
  options?: {
    onConnectionRejected?: (message: string) => void;
    onConnectionNotice?: (message: string) => void;
  },
): FlowEditorController {
  const initial = useMemo(() => graphToFlow(initialProject.flow), []);
  const [start, setStart] = useState(initialProject.flow.start);
  const [nodes, setNodes, applyNodeChanges] = useNodesState<HoblioFlowNode>(initial.nodes);
  const [edges, setEdges, applyEdgeChanges] = useEdgesState<HoblioFlowEdge>(initial.edges);
  const [editing, setEditing] = useState(true);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryState>(() => ({
    items: [{ nodes: initial.nodes, edges: initial.edges, start: initialProject.flow.start }],
    index: 0,
  }));

  const snapshotRef = useRef<CanvasSnapshot>({ nodes: initial.nodes, edges: initial.edges, start: initialProject.flow.start });
  const controlSpawnRef = useRef(0);
  const actionSpawnRef = useRef(0);
  const [fitViewToken, setFitViewToken] = useState(0);
  const onConnectionRejected = options?.onConnectionRejected;
  const onConnectionNotice = options?.onConnectionNotice;

  useEffect(() => {
    snapshotRef.current = { nodes, edges, start };
  }, [nodes, edges, start]);

  const applySnapshot = useCallback(
    (snapshot: CanvasSnapshot) => {
      setStart(snapshot.start);
      setNodes(structuredClone(snapshot.nodes));
      setEdges(structuredClone(snapshot.edges));
      setSelectedEdgeId(null);
    },
    [setEdges, setNodes],
  );

  const commitHistory = useCallback(() => {
    window.setTimeout(() => {
      const snapshot = cloneSnapshot(snapshotRef.current);
      setHistory((current) => {
        if (snapshotsEqual(current.items[current.index], snapshot)) {
          return current;
        }
        const items = [...current.items.slice(0, current.index + 1), snapshot].slice(-HISTORY_LIMIT);
        return { items, index: items.length - 1 };
      });
    }, 0);
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.index <= 0) {
        return current;
      }
      const index = current.index - 1;
      applySnapshot(current.items[index]);
      return { ...current, index };
    });
  }, [applySnapshot]);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (current.index >= current.items.length - 1) {
        return current;
      }
      const index = current.index + 1;
      applySnapshot(current.items[index]);
      return { ...current, index };
    });
  }, [applySnapshot]);

  const loadProject = useCallback(
    (project: FlowProject) => {
      const canvas = graphToFlow(project.flow);
      const snapshot: CanvasSnapshot = {
        nodes: canvas.nodes,
        edges: canvas.edges,
        start: project.flow.start,
      };
      applySnapshot(snapshot);
      setHistory({ items: [cloneSnapshot(snapshot)], index: 0 });
      controlSpawnRef.current = 0;
      actionSpawnRef.current = 0;
      setFitViewToken((t) => t + 1);
    },
    [applySnapshot],
  );

  const toFlowGraph = useCallback((): FlowGraph => flowToGraph(nodes, edges, start), [edges, nodes, start]);

  const nodeById = useCallback(
    (id: string | null | undefined) => (id ? nodes.find((node) => node.id === id) : undefined),
    [nodes],
  );

  const connectionRejectReason = useCallback(
    (connection: Connection): string | null => {
      const source = nodeById(connection.source);
      const target = nodeById(connection.target);
      if (!connection.source || !connection.target) {
        return null;
      }
      if (!source || !target) {
        return "Connection not allowed";
      }
      if (source.data.flowNode.kind === "end") {
        return "Cannot connect from an End node";
      }
      if (target.data.flowNode.kind === "start") {
        return "Cannot connect to Start";
      }
      if (connection.source === connection.target) {
        return "Cannot connect a node to itself";
      }
      return null;
    },
    [nodeById],
  );

  const isValidConnection = useCallback(
    (connection: Connection) => connectionRejectReason(connection) === null,
    [connectionRejectReason],
  );

  const rejectConnection = useCallback(
    (_connection: Connection, reason: string) => {
      onConnectionRejected?.(reason);
    },
    [onConnectionRejected],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const rejectReason = connectionRejectReason(connection);
      if (rejectReason) {
        rejectConnection(connection, rejectReason);
        return;
      }
      const id = newEdgeId();
      const sourceNode = nodeById(connection.source);
      let replacedExisting = false;
      setEdges((current) => {
        const sourceKind = sourceNode?.data.flowNode.kind ?? "action";
        const handle = sourceHandleKey(
          sourceKind,
          typeof connection.sourceHandle === "string" ? connection.sourceHandle : undefined,
        );
        const withoutDuplicateSource = current.filter((edge) => {
          if (edge.source !== connection.source) {
            return true;
          }
          const edgeKind = nodeById(edge.source)?.data.flowNode.kind ?? "action";
          const edgeHandle = sourceHandleKey(
            edgeKind,
            typeof edge.sourceHandle === "string" ? edge.sourceHandle : undefined,
          );
          if (edgeHandle === handle) {
            replacedExisting = true;
            return false;
          }
          return true;
        });
        return addEdge(defaultEdge(connection, id), withoutDuplicateSource);
      });
      if (replacedExisting) {
        onConnectionNotice?.("Replaced existing connection from this output");
      }
      commitHistory();
    },
    [
      commitHistory,
      connectionRejectReason,
      nodeById,
      onConnectionNotice,
      rejectConnection,
      setEdges,
    ],
  );

  const onConnectEnd = useCallback(
    (connectionState: FinalConnectionState) => {
      if (connectionState.isValid !== false) {
        return;
      }
      const from = connectionState.fromNode;
      const to = connectionState.toNode;
      if (!from || !to) {
        return;
      }
      const connection: Connection = {
        source: from.id,
        target: to.id,
        sourceHandle: connectionState.fromHandle?.id ?? null,
        targetHandle: connectionState.toHandle?.id ?? null,
      };
      const reason = connectionRejectReason(connection);
      if (reason) {
        rejectConnection(connection, reason);
      }
    },
    [connectionRejectReason, rejectConnection],
  );

  const onReconnect = useCallback(
    (edge: HoblioFlowEdge, connection: Connection) => {
      if (!isValidConnection(connection)) {
        return;
      }
      setEdges((current) => {
        let next = reconnectEdge(edge, connection, current, { shouldReplaceId: false });
        next = next.map((item) => {
          if (item.id !== edge.id) {
            return item;
          }
          const flowEdge = item.data?.flowEdge;
          const sourceHandle =
            typeof connection.sourceHandle === "string"
              ? connection.sourceHandle
              : flowEdge?.ui?.sourceHandle;
          const port = parseEdgePort(
            typeof sourceHandle === "string" ? sourceHandle : undefined,
          );
          return {
            ...item,
            label: port && port !== "main" ? port : item.label,
            data: {
              flowEdge: {
                ...flowEdge,
                from: item.source,
                to: item.target,
                port,
                label: port && port !== "main" ? port : flowEdge?.label,
                ui: {
                  ...flowEdge?.ui,
                  sourceHandle,
                  targetHandle:
                    typeof connection.targetHandle === "string"
                      ? connection.targetHandle
                      : flowEdge?.ui?.targetHandle,
                },
              },
              waypoints: item.data?.waypoints ?? [],
            },
          };
        });
        const sourceHandles = new Set<string>();
        return next.filter((item) => {
          const edgeKind = nodeById(item.source)?.data.flowNode.kind ?? "action";
          const handle = sourceHandleKey(
            edgeKind,
            typeof item.sourceHandle === "string" ? item.sourceHandle : undefined,
          );
          const key = `${item.source}:${handle}`;
          if (sourceHandles.has(key)) {
            return false;
          }
          sourceHandles.add(key);
          return true;
        });
      });
      commitHistory();
    },
    [commitHistory, isValidConnection, nodeById, setEdges],
  );

  const onEdgesChange = useCallback<OnEdgesChange<HoblioFlowEdge>>(
    (changes: EdgeChange<HoblioFlowEdge>[]) => {
      for (const change of changes) {
        if (change.type === "select") {
          if (change.selected) {
            setSelectedEdgeId(change.id);
          } else {
            setSelectedEdgeId((current) => (current === change.id ? null : current));
          }
        }
      }
      const removals = changes.filter((change) => change.type === "remove");
      const rest = changes.filter((change) => change.type !== "remove");
      if (removals.length > 0) {
        const ids = new Set(removals.map((change) => change.id));
        setEdges((current) => current.filter((edge) => !ids.has(edge.id)));
        setSelectedEdgeId((current) => (current && ids.has(current) ? null : current));
        commitHistory();
      }
      if (rest.length > 0) {
        applyEdgeChanges(rest);
      }
    },
    [applyEdgeChanges, commitHistory, setEdges],
  );

  const onNodesChange = useCallback<OnNodesChange<HoblioFlowNode>>(
    (changes) => {
      if (changes.some((change) => change.type === "remove")) {
        commitHistory();
      }
      applyNodeChanges(changes);
    },
    [applyNodeChanges, commitHistory],
  );

  const setEdgeLabel = useCallback(
    (edgeId: string, label: string) => {
      setEdges((current) =>
        current.map((edge) => {
          if (edge.id !== edgeId) {
            return edge;
          }
          return {
            ...edge,
            label: label || undefined,
            data: {
              flowEdge: { ...edge.data!.flowEdge, label: label || undefined },
              waypoints: edge.data?.waypoints ?? [],
            },
          };
        }),
      );
      commitHistory();
    },
    [commitHistory, setEdges],
  );

  const setEdgeWaypoints = useCallback(
    (edgeId: string, waypoints: Waypoint[]) => {
      setEdges((current) =>
        current.map((edge) =>
          edge.id === edgeId
            ? { ...edge, selected: true, data: { ...edge.data!, waypoints } }
            : edge,
        ),
      );
    },
    [setEdges],
  );

  const setNodePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      setNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, position: { ...position } } : node)),
      );
    },
    [setNodes],
  );

  const selectEdge = useCallback(
    (edgeId: string | null) => {
      setSelectedEdgeId(edgeId);
      setEdges((current) => current.map((edge) => ({ ...edge, selected: edge.id === edgeId })));
    },
    [setEdges],
  );

  const selectNode = useCallback(
    (nodeId: string | null) => {
      setSelectedEdgeId(null);
      setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          selected: nodeId !== null && node.id === nodeId,
        })),
      );
    },
    [setEdges, setNodes],
  );

  const addControlNode = useCallback(
    (
      kind: Extract<
        NodeKind,
        "if" | "for_each" | "while_loop" | "repeat" | "next_loop" | "exit_loop"
      >,
    ) => {
      const id = `${kind}_${Date.now().toString(36)}`;
      const idx = controlSpawnRef.current++;
      const { x, y } = spawnPosition(idx, 240, 240);
      const controlKinds = ["if", "for_each", "while_loop", "repeat"] as const;
      const labelByKind: Partial<Record<NodeKind, string>> = {
        for_each: "For each",
        if: "If",
        while_loop: "While",
        repeat: "Repeat",
      };
      const flowNode: FlowNode = {
        id,
        kind,
        label: labelByKind[kind] ?? kind.replace(/_/g, " "),
        control: (controlKinds as readonly string[]).includes(kind)
          ? defaultControl(kind as "if" | "for_each" | "while_loop" | "repeat")
          : undefined,
        ui: { x, y },
      };
      const node: HoblioFlowNode = {
        id,
        type: "hoblio",
        position: { x, y },
        data: { flowNode },
      };
      setNodes((current) => [...current, node]);
      commitHistory();
    },
    [commitHistory, setNodes],
  );

  const addAction = useCallback(
    (type: ActionKind["type"], seedVariables?: Record<string, unknown>) => {
      const id = newActionNodeId();
      const idx = actionSpawnRef.current++;
      const { x, y } = spawnPosition(idx, 200, 400);
      const flowNodes = snapshotRef.current.nodes.map((n) => n.data.flowNode);
      const taken = collectTakenVariableNames(flowNodes, seedVariables ?? {});
      const flowNode: FlowNode = {
        id,
        kind: "action",
        label: type.replace(/_/g, " "),
        action: defaultAction(type, { takenNames: taken }),
        ui: { x, y },
      };
      const node: HoblioFlowNode = {
        id,
        type: "hoblio",
        position: { x, y },
        data: { flowNode },
      };
      setNodes((current) => [...current, node]);
      commitHistory();
    },
    [commitHistory, setNodes],
  );

  const addEndNode = useCallback(() => {
    const id = `end_${Date.now().toString(36)}`;
    const flowNode: FlowNode = {
      id,
      kind: "end",
      label: "End",
      ui: { x: 520, y: 120 },
    };
    const node: HoblioFlowNode = {
      id,
      type: "hoblio",
      position: { x: 520, y: 120 },
      data: { flowNode },
    };
    setNodes((current) => [...current, node]);
    commitHistory();
  }, [commitHistory, setNodes]);

  const updateFlowNode = useCallback(
    (flowNode: FlowNode, options?: { recordHistory?: boolean }) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === flowNode.id ? { ...node, data: { ...node.data, flowNode } } : node,
        ),
      );
      if (options?.recordHistory !== false) {
        commitHistory();
      }
    },
    [commitHistory, setNodes],
  );

  const applyVariableRename = useCallback(
    (oldName: string, newName: string) => {
      if (!oldName || !newName || oldName === newName) {
        return;
      }
      setNodes((current) => {
        const flowNodes = current.map((n) => n.data.flowNode);
        const renamed = renameVariableInFlowNodes(flowNodes, oldName, newName);
        return current.map((node, index) => ({
          ...node,
          data: { ...node.data, flowNode: renamed[index]! },
        }));
      });
      commitHistory();
    },
    [commitHistory, setNodes],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      const { nodes: currentNodes, edges: currentEdges } = snapshotRef.current;
      const node = currentNodes.find((item) => item.id === nodeId);
      if (!node || node.data.flowNode.kind === "start") {
        return;
      }
      setNodes(currentNodes.filter((item) => item.id !== nodeId));
      setEdges(
        currentEdges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
      commitHistory();
    },
    [commitHistory, setEdges, setNodes],
  );

  const deleteSelection = useCallback(() => {
    const { nodes: currentNodes, edges: currentEdges } = snapshotRef.current;
    const removeNodeIds = new Set(
      currentNodes
        .filter((node) => node.selected && node.data.flowNode.kind !== "start")
        .map((node) => node.id),
    );
    const nextNodes = currentNodes.filter((node) => !removeNodeIds.has(node.id));
    const nextEdges = currentEdges.filter(
      (edge) => !edge.selected && !removeNodeIds.has(edge.source) && !removeNodeIds.has(edge.target),
    );
    if (nextNodes.length === currentNodes.length && nextEdges.length === currentEdges.length) {
      return;
    }
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedEdgeId(null);
    commitHistory();
  }, [commitHistory, setEdges, setNodes]);

  const canUndo = history.index > 0;
  const canRedo = history.index < history.items.length - 1;

  return {
    nodes,
    edges,
    start,
    editing,
    setEditing,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onConnectEnd,
    onReconnect,
    isValidConnection,
    selectedEdgeId,
    selectEdge,
    selectNode,
    setEdgeLabel,
    setEdgeWaypoints,
    setNodePosition,
    commitHistory,
    canUndo,
    canRedo,
    undo,
    redo,
    loadProject,
    fitViewToken,
    toFlowGraph,
    addAction,
    applyVariableRename,
    addControlNode,
    addEndNode,
    deleteSelection,
    deleteNode,
    updateFlowNode,
  };
}
