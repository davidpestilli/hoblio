import {
  addEdge,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type EdgeChange,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { flowToGraph, graphToFlow, newActionNodeId, type HoblioNodeData } from "../flowConvert";
import type { ActionKind, FlowGraph, FlowNode, FlowProject } from "../model";
import { defaultAction } from "../model";
import type { HoblioFlowEdge, HoblioFlowNode } from "./flowTypes";
import { newEdgeId } from "./flowTypes";
import type { Waypoint } from "../model";

const HISTORY_LIMIT = 40;

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
  return {
    ...connection,
    id,
    type: "waypoint",
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    data: {
      flowEdge: { id, from: connection.source!, to: connection.target! },
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
  onReconnect: (edge: HoblioFlowEdge, connection: Connection) => void;
  isValidConnection: (connection: Connection) => boolean;
  selectedEdgeId: string | null;
  selectEdge: (edgeId: string | null) => void;
  setEdgeLabel: (edgeId: string, label: string) => void;
  setEdgeWaypoints: (edgeId: string, waypoints: Waypoint[]) => void;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  commitHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  loadProject: (project: FlowProject) => void;
  toFlowGraph: () => FlowGraph;
  addAction: (type: ActionKind["type"]) => void;
  addEndNode: () => void;
  deleteSelection: () => void;
  deleteNode: (nodeId: string) => void;
  updateFlowNode: (flowNode: FlowNode) => void;
}

export function useFlowEditor(initialProject: FlowProject): FlowEditorController {
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
    },
    [applySnapshot],
  );

  const toFlowGraph = useCallback((): FlowGraph => flowToGraph(nodes, edges, start), [edges, nodes, start]);

  const nodeById = useCallback(
    (id: string | null | undefined) => (id ? nodes.find((node) => node.id === id) : undefined),
    [nodes],
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const source = nodeById(connection.source);
      const target = nodeById(connection.target);
      if (!source || !target) {
        return false;
      }
      if (source.data.flowNode.kind === "end") {
        return false;
      }
      if (target.data.flowNode.kind === "start") {
        return false;
      }
      if (connection.source === connection.target) {
        return false;
      }
      return true;
    },
    [nodeById],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) {
        return;
      }
      const id = newEdgeId();
      setEdges((current) => {
        const withoutDuplicateSource = current.filter((edge) => edge.source !== connection.source);
        return addEdge(defaultEdge(connection, id), withoutDuplicateSource);
      });
      commitHistory();
    },
    [commitHistory, isValidConnection, setEdges],
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
          return {
            ...item,
            data: {
              flowEdge: {
                ...flowEdge,
                from: item.source,
                to: item.target,
                ui: {
                  ...flowEdge?.ui,
                  sourceHandle:
                    typeof connection.sourceHandle === "string"
                      ? connection.sourceHandle
                      : flowEdge?.ui?.sourceHandle,
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
        const sources = new Set<string>();
        return next.filter((item) => {
          if (sources.has(item.source)) {
            return false;
          }
          sources.add(item.source);
          return true;
        });
      });
      commitHistory();
    },
    [commitHistory, isValidConnection, setEdges],
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

  const addAction = useCallback(
    (type: ActionKind["type"]) => {
      const id = newActionNodeId();
      const flowNode: FlowNode = {
        id,
        kind: "action",
        label: type.replace(/_/g, " "),
        action: defaultAction(type),
        ui: { x: 240, y: 240 },
      };
      const node: HoblioFlowNode = {
        id,
        type: "hoblio",
        position: { x: 240, y: 240 },
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
    (flowNode: FlowNode) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === flowNode.id ? { ...node, data: { ...node.data, flowNode } } : node,
        ),
      );
    },
    [setNodes],
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
    onReconnect,
    isValidConnection,
    selectedEdgeId,
    selectEdge,
    setEdgeLabel,
    setEdgeWaypoints,
    setNodePosition,
    commitHistory,
    canUndo,
    canRedo,
    undo,
    redo,
    loadProject,
    toFlowGraph,
    addAction,
    addEndNode,
    deleteSelection,
    deleteNode,
    updateFlowNode,
  };
}
