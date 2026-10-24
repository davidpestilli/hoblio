import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { confirm, open } from "@tauri-apps/plugin-dialog";

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

function formatError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

function variablesToJson(variables: Record<string, unknown>): string {
  try {
    return JSON.stringify(variables, null, 2);
  } catch {
    return "{}";
  }
}

function projectDigest(project: FlowProject): string {
  return JSON.stringify({
    manifest: project.manifest,
    flow: project.flow,
    variables: project.variables,
  });
}

function isRunCancelledMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("cancelled by user") || lower.includes("run cancelled");
}

function parseVariablesJson(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, value: {} };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Variables must be a JSON object." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }
}

export default function App() {
  const [project, setProject] = useState<FlowProject>(() => defaultProject());
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [statusIsError, setStatusIsError] = useState(false);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [showLogJson, setShowLogJson] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variablesJson, setVariablesJson] = useState(() => variablesToJson(project.variables));
  const [variablesError, setVariablesError] = useState<string | null>(null);

  const saveProjectRef = useRef<() => void>(() => {});
  const savedDigestRef = useRef(projectDigest(defaultProject()));
  const [logHeight, setLogHeight] = useState(140);

  const editor = useFlowEditor(project, {
    onConnectionRejected: (message) => setErrStatus(message),
    onConnectionNotice: (message) => setOkStatus(message),
  });

  const syncProjectFromCanvas = useCallback((): FlowProject => {
    const parsed = parseVariablesJson(variablesJson);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return {
      ...project,
      flow: editor.toFlowGraph(),
      variables: parsed.value,
    };
  }, [editor, project, variablesJson]);

  const setOkStatus = (message: string) => {
    setStatusIsError(false);
    setStatus(message);
  };

  const setErrStatus = (message: string) => {
    setStatusIsError(true);
    setStatus(message);
  };

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

  const markSaved = useCallback((current: FlowProject) => {
    savedDigestRef.current = projectDigest(current);
  }, []);

  const hasUnsavedChanges = useCallback((): boolean => {
    try {
      return projectDigest(syncProjectFromCanvas()) !== savedDigestRef.current;
    } catch {
      return true;
    }
  }, [syncProjectFromCanvas]);

  const openProject = async () => {
    try {
      if (hasUnsavedChanges()) {
        const proceed = await confirm(
          "You have unsaved changes. Open another project anyway?",
          { title: "Unsaved changes", kind: "warning" },
        );
        if (!proceed) {
          return;
        }
      }
      const dir = await open({ directory: true, multiple: false });
      if (!dir || typeof dir !== "string") return;
      const loaded = await invoke<FlowProject>("load_project_cmd", { path: dir });
      setProjectDir(dir);
      setProject(loaded);
      editor.loadProject(loaded);
      setVariablesJson(variablesToJson(loaded.variables));
      setVariablesError(null);
      setLogLines([]);
      setSelectedId(null);
      markSaved(loaded);
      setOkStatus(`Opened ${dir}`);
    } catch (e) {
      setErrStatus(`Open failed: ${formatError(e)}`);
    }
  };

  const saveProject = async () => {
    try {
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
      markSaved(current);
      setOkStatus(`Saved ${dir}`);
    } catch (e) {
      setErrStatus(`Save failed: ${formatError(e)}`);
    }
  };

  const validate = async () => {
    try {
      const current = syncProjectFromCanvas();
      await invoke("validate_project_cmd", { project: current });
      setOkStatus("Validation OK");
    } catch (e) {
      setErrStatus(`Validation failed: ${formatError(e)}`);
    }
  };

  const runFlow = async () => {
    if (running) return;
    setRunning(true);
    setLogLines([]);
    setOkStatus("Running…");
    try {
      const current = syncProjectFromCanvas();
      setProject(current);
      const last = await invoke<string>("run_flow_cmd", {
        project: current,
        projectDir,
      });
      setOkStatus(`Run finished at ${last}`);
    } catch (e) {
      const msg = formatError(e);
      if (isRunCancelledMessage(msg)) {
        setOkStatus("Run cancelled");
      } else {
        setErrStatus(`Run failed: ${msg}`);
      }
    } finally {
      setRunning(false);
      setActiveNodeId(null);
    }
  };

  const stopRun = async () => {
    if (!running) return;
    try {
      await invoke("cancel_run_cmd");
      setOkStatus("Cancel requested…");
    } catch (e) {
      setErrStatus(`Cancel failed: ${formatError(e)}`);
    }
  };

  const handleVariablesJsonChange = (value: string) => {
    setVariablesJson(value);
    const parsed = parseVariablesJson(value);
    setVariablesError(parsed.ok ? null : parsed.error);
  };

  saveProjectRef.current = () => {
    void saveProject();
  };

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (ev.ctrlKey && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        saveProjectRef.current();
        return;
      }
      if (inField) return;
      if (ev.ctrlKey && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) {
          editor.redo();
        } else {
          editor.undo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

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
        <button type="button" onClick={() => void stopRun()} disabled={!running}>
          Stop
        </button>
        <span className={`status ${statusIsError ? "status-error" : ""}`}>{status}</span>
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
          <h4 className="palette-group">Condicionais</h4>
          <button type="button" onClick={() => editor.addControlNode("if")}>
            If
          </button>
          <h4 className="palette-group">Loops</h4>
          <button type="button" onClick={() => editor.addControlNode("for_each")}>
            For each
          </button>
          <button type="button" onClick={() => editor.addControlNode("next_loop")}>
            Next loop
          </button>
          <button type="button" onClick={() => editor.addControlNode("exit_loop")}>
            Exit loop
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
          editing={editor.editing}
          variablesJson={variablesJson}
          variablesError={variablesError}
          onVariablesJsonChange={handleVariablesJsonChange}
          onChange={(node, options) => editor.updateFlowNode(node, options)}
          onPropertyCommit={() => editor.commitHistory()}
          onDelete={
            editor.editing && selectedId && selectedNode?.kind !== "start"
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
        height={logHeight}
        onHeightChange={setLogHeight}
      />
    </div>
  );
}
