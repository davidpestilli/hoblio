import type { OnBeforeDelete, OnNodesChange } from "@xyflow/react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
  type IsValidConnection,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FlowAlignmentGuides } from "./FlowAlignmentGuides";
import { FlowToolbar } from "./FlowToolbar";
import { computeSnap, guidesEqual, type AlignmentGuide, type Rect } from "./flowAlignment";
import { FlowEditorProvider } from "./flowContext";
import { edgeTypes, nodeTypes } from "./flowRegistry";
import type { HoblioFlowEdge, HoblioFlowNode } from "./flowTypes";
import type { FlowEditorController } from "./useFlowEditor";

const FALLBACK_NODE_WIDTH = 148;
const FALLBACK_NODE_HEIGHT = 56;

interface FlowCanvasProps {
  controller: FlowEditorController;
  onSelectNodeId: (nodeId: string | null) => void;
  onClearFlow?: () => void;
}

function FlowSurface({ controller, onSelectNodeId, onClearFlow }: FlowCanvasProps) {
  const { fitView } = useReactFlow();
  const store = useStoreApi();
  const [guides, setGuides] = useState<AlignmentGuide[]>([]);
  const guidesRef = useRef<AlignmentGuide[]>([]);

  const publishGuides = useCallback((next: AlignmentGuide[]) => {
    if (guidesEqual(guidesRef.current, next)) {
      return;
    }
    guidesRef.current = next;
    setGuides(next);
  }, []);

  const handleNodesChange = useCallback<OnNodesChange<HoblioFlowNode>>(
    (changes) => {
      if (!controller.editing) {
        controller.onNodesChange(changes);
        return;
      }
      const { nodeLookup } = store.getState();
      let nextGuides: AlignmentGuide[] = [];
      let dragging = false;

      for (const change of changes) {
        if (change.type !== "position" || !change.position || !change.dragging) {
          continue;
        }
        const dragged = nodeLookup.get(change.id);
        if (!dragged) {
          continue;
        }
        const others: { id: string; rect: Rect }[] = [];
        for (const [id, node] of nodeLookup) {
          if (id === change.id || node.hidden) {
            continue;
          }
          others.push({
            id,
            rect: {
              x: node.position.x,
              y: node.position.y,
              width: node.measured?.width ?? node.width ?? FALLBACK_NODE_WIDTH,
              height: node.measured?.height ?? node.height ?? FALLBACK_NODE_HEIGHT,
            },
          });
        }
        const snapped = computeSnap(
          {
            x: change.position.x,
            y: change.position.y,
            width: dragged.measured?.width ?? dragged.width ?? FALLBACK_NODE_WIDTH,
            height: dragged.measured?.height ?? dragged.height ?? FALLBACK_NODE_HEIGHT,
          },
          others,
        );
        nextGuides = snapped.guides;
        dragging = true;
      }

      if (dragging) {
        publishGuides(nextGuides);
      }
      controller.onNodesChange(changes);
    },
    [controller, publishGuides, store],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: HoblioFlowNode, draggedNodes?: HoblioFlowNode[]) => {
      const singleDrag = !draggedNodes || draggedNodes.length <= 1;
      if (controller.editing && singleDrag) {
        const { nodeLookup } = store.getState();
        const dragged = nodeLookup.get(node.id);
        if (dragged) {
          const others: { id: string; rect: Rect }[] = [];
          for (const [id, other] of nodeLookup) {
            if (id === node.id || other.hidden) {
              continue;
            }
            others.push({
              id,
              rect: {
                x: other.position.x,
                y: other.position.y,
                width: other.measured?.width ?? other.width ?? FALLBACK_NODE_WIDTH,
                height: other.measured?.height ?? other.height ?? FALLBACK_NODE_HEIGHT,
              },
            });
          }
          const snapped = computeSnap(
            {
              x: node.position.x,
              y: node.position.y,
              width: dragged.measured?.width ?? dragged.width ?? FALLBACK_NODE_WIDTH,
              height: dragged.measured?.height ?? dragged.height ?? FALLBACK_NODE_HEIGHT,
            },
            others,
          );
          if (snapped.position.x !== node.position.x || snapped.position.y !== node.position.y) {
            controller.setNodePosition(node.id, snapped.position);
          }
        }
      }
      controller.commitHistory();
      publishGuides([]);
    },
    [controller, publishGuides, store],
  );

  const handleBeforeDelete = useCallback<OnBeforeDelete<HoblioFlowNode, HoblioFlowEdge>>(
    async ({ nodes, edges }) => ({
      nodes: nodes.filter((node) => node.data.flowNode.kind !== "start"),
      edges,
    }),
    [],
  );

  useEffect(() => {
    if (controller.fitViewToken <= 0) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      void fitView({ padding: 0.12, minZoom: 0.15, maxZoom: 1, duration: 200 });
    });
    return () => window.cancelAnimationFrame(id);
  }, [controller.fitViewToken, fitView]);

  const isValidConnection: IsValidConnection<HoblioFlowEdge> = useCallback(
    (edgeOrConnection) => {
      const connection =
        "id" in edgeOrConnection
          ? {
              source: edgeOrConnection.source,
              target: edgeOrConnection.target,
              sourceHandle: edgeOrConnection.sourceHandle ?? null,
              targetHandle: edgeOrConnection.targetHandle ?? null,
            }
          : {
              source: edgeOrConnection.source,
              target: edgeOrConnection.target,
              sourceHandle: edgeOrConnection.sourceHandle ?? null,
              targetHandle: edgeOrConnection.targetHandle ?? null,
            };
      return controller.isValidConnection(connection);
    },
    [controller],
  );

  const editorApi = useMemo(
    () => ({
      editing: controller.editing,
      setEdgeWaypoints: controller.setEdgeWaypoints,
      commitHistory: controller.commitHistory,
    }),
    [controller.commitHistory, controller.editing, controller.setEdgeWaypoints],
  );

  return (
    <FlowEditorProvider value={editorApi}>
      <div className="flow-canvas-wrap">
        <FlowToolbar controller={controller} onClearFlow={onClearFlow} />
        <div className="flow-canvas-inner">
          <ReactFlow
            nodes={controller.nodes}
            edges={controller.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.12, minZoom: 0.15, maxZoom: 1 }}
            minZoom={0.1}
            maxZoom={2}
            nodesDraggable={controller.editing}
            nodesConnectable={controller.editing}
            edgesReconnectable={controller.editing}
            elementsSelectable
            panOnScroll
            zoomOnDoubleClick={false}
            snapToGrid={controller.editing}
            snapGrid={[10, 10]}
            deleteKeyCode={controller.editing ? ["Backspace", "Delete"] : null}
            isValidConnection={isValidConnection}
            onNodesChange={handleNodesChange}
            onEdgesChange={controller.onEdgesChange}
            onConnect={controller.onConnect}
            onConnectEnd={(_event, connectionState) => controller.onConnectEnd(connectionState)}
            onReconnect={controller.onReconnect}
            onNodeDragStop={handleNodeDragStop}
            onBeforeDelete={handleBeforeDelete}
            onSelectionChange={({ nodes: selected }) => {
              onSelectNodeId(selected[0]?.id ?? null);
            }}
            onEdgeClick={(_, edge) => controller.selectEdge(edge.id)}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
            <FlowAlignmentGuides guides={guides} />
          </ReactFlow>
        </div>
      </div>
    </FlowEditorProvider>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowSurface {...props} />
    </ReactFlowProvider>
  );
}
