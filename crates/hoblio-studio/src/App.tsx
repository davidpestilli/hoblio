import { useCallback, useEffect, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import { FlowCanvas } from "./flow/FlowCanvas";
import { useFlowEditor } from "./flow/useFlowEditor";
import {
  defaultProject,
  type FlowNode,
  type FlowProject,
  type ActionKind,
} from "./model";
import { PropertiesPanel } from "./PropertiesPanel";
import { RunLogPanel } from "./RunLogPanel";
import { logLineFromEvent, type LogLine, type RunEvent } from "./runLog";

export default function App() {
  const [project, setProject] = useState<FlowProject>(() => defaultProject());
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [showLogJson, setShowLogJson] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const editor = useFlowEditor(project);

  const syncProjectFromCanvas = useCallback((): FlowProject => {
    return { ...project, flow: editor.toFlowGraph() };
  }, [editor, project]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const fn = await listen<RunEvent>("hoblio-run-event", (ev) => {
        if (cancelled) return;
        const e = ev.payload;
        if (e.kind === "node_enter") setActiveNodeId(e.node_id);
        if (e.kind === "run_finished") setActiveNodeId(null);
        setLogLines((prev) => [...prev, logLineFromEvent(e)]);
      });
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const nodesWithActive = useMemo(
    () =>
      editor.nodes.map((n) => ({
        ...n,
        data: { ...n.data, active: n.id === activeNodeId },
      })),
    [activeNodeId, editor.nodes],
  );

  const editorWithActive = useMemo(
    () => ({ ...editor, nodes: nodesWithActive }),
    [editor, nodesWithActive],
  );

  const selectedNode: FlowNode | null = useMemo(() => {
    if (!selectedId) return null;
    const n = editor.nodes.find((x) => x.id === selectedId);
    return n?.data.flowNode ?? null;
  }, [editor.nodes, selectedId]);

  const openProject = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (!dir || typeof dir !== "string") return;
    const loaded = await invoke<FlowProject>("load_project_cmd", { path: dir });
    setProjectDir(dir);
    setProject(loaded);
    editor.loadProject(loaded);
    setLogLines([]);
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
    setLogLines([]);
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

  const addAction = (type: ActionKind["type"]) => editor.addAction(type);

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
          <button type="button" onClick={() => addAction("browser_click")}>
            BrowserClick
          </button>
          <button type="button" onClick={() => addAction("browser_fill")}>
            BrowserFill
          </button>
          <button type="button" onClick={() => addAction("browser_wait_for")}>
            BrowserWaitFor
          </button>
          <button type="button" onClick={() => addAction("browser_get_text")}>
            BrowserGetText
          </button>
          <button type="button" onClick={() => addAction("show_message")}>
            ShowMessage
          </button>
          <hr className="palette-divider" />
          <button type="button" onClick={() => editor.addEndNode()}>
            End node
          </button>
        </aside>
        <div className="canvas">
          <FlowCanvas controller={editorWithActive} onSelectNodeId={setSelectedId} />
        </div>
        <PropertiesPanel
          node={selectedNode}
          onChange={editor.updateFlowNode}
          onDelete={
            selectedId && selectedNode?.kind !== "start"
              ? () => {
                  editor.deleteNode(selectedId);
                  setSelectedId(null);
                }
              : undefined
          }
        />
      </div>
      <RunLogPanel
        lines={logLines}
        showJson={showLogJson}
        onToggleJson={() => setShowLogJson((v) => !v)}
      />
    </div>
  );
}
