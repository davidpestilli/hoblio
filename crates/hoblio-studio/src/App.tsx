import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import { HoblioNode } from "./HoblioNode";
import {
  flowToGraph,
  graphToFlow,
  newActionNodeId,
  type HoblioNodeData,
} from "./flowConvert";
import {
  defaultAction,
  defaultProject,
  type ActionKind,
  type FlowNode,
  type FlowProject,
} from "./model";
import { PropertiesPanel } from "./PropertiesPanel";

type RunEvent =
  | { kind: "run_started"; project: string }
  | { kind: "node_enter"; node_id: string }
  | { kind: "node_exit"; node_id: string }
  | { kind: "action_executed"; node_id: string; summary: string }
  | { kind: "run_finished"; last_node: string };

const nodeTypes = { hoblio: HoblioNode };

export default function App() {
  const [project, setProject] = useState<FlowProject>(defaultProject);
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [logs, setLogs] = useState<string[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const initial = useMemo(() => graphToFlow(project.flow), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const syncProjectFromCanvas = useCallback((): FlowProject => {
    const flow = flowToGraph(nodes, edges, project.flow.start);
    return { ...project, flow };
  }, [nodes, edges, project]);

  const loadCanvas = useCallback((p: FlowProject) => {
    const { nodes: n, edges: e } = graphToFlow(p.flow);
    setNodes(n);
    setEdges(e);
    setProject(p);
  }, [setNodes, setEdges]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, active: n.id === activeNodeId },
      })),
    );
  }, [activeNodeId, setNodes]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<RunEvent>("hoblio-run-event", (ev) => {
      const e = ev.payload;
      if (e.kind === "node_enter") setActiveNodeId(e.node_id);
      if (e.kind === "run_finished") setActiveNodeId(null);
      setLogs((prev) => [...prev, JSON.stringify(e)]);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const selectedNode: FlowNode | null = useMemo(() => {
    if (!selectedId) return null;
    const n = nodes.find((x) => x.id === selectedId);
    return n?.data.flowNode ?? null;
  }, [nodes, selectedId]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: `e-${c.source}-${c.target}` }, eds)),
    [setEdges],
  );

  const openProject = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (!dir || typeof dir !== "string") return;
    const loaded = await invoke<FlowProject>("load_project_cmd", { path: dir });
    setProjectDir(dir);
    loadCanvas(loaded);
    setLogs([]);
    setStatus(`Opened ${dir}`);
  };

  const saveProject = async () => {
    let dir = projectDir;
    if (!dir) {
      const picked = await open({ directory: true, multiple: false });
      if (!picked || typeof picked !== "string") return;
      dir = picked;
      setProjectDir(dir);
    }
    const current = syncProjectFromCanvas();
    await invoke("save_project_cmd", { path: dir, project: current });
    setProject(current);
    setStatus(`Saved ${dir}`);
  };

  const validate = async () => {
    const current = syncProjectFromCanvas();
    await invoke("validate_project_cmd", { project: current });
    setStatus("Validation OK");
  };

  const runFlow = async () => {
    if (running) return;
    setRunning(true);
    setLogs([]);
    setStatus("Running…");
    try {
      const current = syncProjectFromCanvas();
      setProject(current);
      const last = await invoke<string>("run_flow_cmd", { project: current });
      setStatus(`Run finished at ${last}`);
    } catch (e) {
      setStatus(`Run failed: ${e}`);
    } finally {
      setRunning(false);
      setActiveNodeId(null);
    }
  };

  const addAction = (type: ActionKind["type"]) => {
    const id = newActionNodeId();
    const flowNode: FlowNode = {
      id,
      kind: "action",
      label: type.replace(/_/g, " "),
      action: defaultAction(type),
      ui: { x: 240, y: 240 },
    };
    const node: Node<HoblioNodeData> = {
      id,
      type: "hoblio",
      position: { x: 240, y: 240 },
      data: { flowNode },
    };
    setNodes((nds) => [...nds, node]);
  };

  const updateSelectedNode = (flowNode: FlowNode) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === flowNode.id ? { ...n, data: { flowNode } } : n)),
    );
  };

  return (
    <div className="app">
      <header className="toolbar">
        <strong>Hoblio Studio</strong>
        <button type="button" onClick={openProject}>
          Open
        </button>
        <button type="button" onClick={saveProject}>
          Save
        </button>
        <button type="button" onClick={validate}>
          Validate
        </button>
        <button type="button" onClick={runFlow} disabled={running}>
          Run
        </button>
        <span className="status">{status}</span>
        {projectDir && <span className="path">{projectDir}</span>}
      </header>
      <div className="main">
        <aside className="panel palette">
          <h3>Palette</h3>
          <button type="button" onClick={() => addAction("log")}>
            Log
          </button>
          <button type="button" onClick={() => addAction("no_op")}>
            NoOp
          </button>
          <button type="button" onClick={() => addAction("file_write")}>
            FileWrite
          </button>
          <button type="button" onClick={() => addAction("http_get")}>
            HttpGet
          </button>
          <button type="button" onClick={() => addAction("browser_navigate")}>
            BrowserNavigate
          </button>
        </aside>
        <div className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={({ nodes: sel }) => setSelectedId(sel[0]?.id ?? null)}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        <PropertiesPanel node={selectedNode} onChange={updateSelectedNode} />
      </div>
      <footer className="log-panel">
        <h3>Run log</h3>
        <pre>{logs.join("\n")}</pre>
      </footer>
    </div>
  );
}
