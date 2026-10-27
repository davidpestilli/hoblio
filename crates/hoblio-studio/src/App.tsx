import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, open } from "@tauri-apps/plugin-dialog";

import { FlowCanvas } from "./flow/FlowCanvas";
import { useFlowEditor } from "./flow/useFlowEditor";
import {
  defaultProject,
  type FlowNode,
  type FlowProject,
  type ActionKind,
} from "./model";
import { renameVariableInSeed } from "./flowVariables";
import { PropertiesPanel } from "./PropertiesPanel";
import { RunLogPanel } from "./RunLogPanel";
import { logLineFromEvent, type LogLine, type RunEvent } from "./runLog";
import { FlowTabs } from "./FlowTabs";
import { entryFlowPath, type FlowDocument, type ProjectFlowEntry } from "./projectFlows";
import {
  defaultSubflowBundle,
  deleteSubflowFromDocument,
  documentForEditorTarget,
  flushCanvasToDocument,
  renameSubflowInDocument,
  isSubflowEditor,
  listSubflowIds,
  newSubflowId,
  ownerFilePath,
  parseEditorKey,
  subflowEditorKey,
} from "./subflowEditor";
import { readWorkspaceSession, writeWorkspaceSession } from "./workspaceSession";

function formatError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

function editorDigest(project: FlowProject, editorKey: string): string {
  return JSON.stringify({
    key: editorKey,
    manifest: project.manifest,
    flow: project.flow,
    variables: project.variables,
  });
}

function isRunCancelledMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("cancelled by user") || lower.includes("run cancelled");
}

function projectWithClearedFlow(base: FlowProject): FlowProject {
  const blank = defaultProject();
  return {
    ...base,
    flow: blank.flow,
    variables: {},
  };
}

const restoredWorkspace = readWorkspaceSession();

export default function App() {
  const [project, setProject] = useState<FlowProject>(
    () => restoredWorkspace?.project ?? defaultProject(),
  );
  const [projectDir, setProjectDir] = useState<string | null>(
    () => restoredWorkspace?.projectDir ?? null,
  );
  const [status, setStatus] = useState("Ready");
  const [statusIsError, setStatusIsError] = useState(false);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [showLogJson, setShowLogJson] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastRunVariablesByNode, setLastRunVariablesByNode] = useState<
    Record<string, Record<string, string>>
  >({});
  const [variables, setVariables] = useState<Record<string, unknown>>(
    () => restoredWorkspace?.project.variables ?? defaultProject().variables,
  );
  const [flowTabs, setFlowTabs] = useState<ProjectFlowEntry[]>([]);
  const [subflowTabIds, setSubflowTabIds] = useState<string[]>([]);
  const [activeEditorKey, setActiveEditorKey] = useState(
    () =>
      restoredWorkspace?.activeEditorKey ??
      restoredWorkspace?.activeFlowPath ??
      "flow.json",
  );

  const saveProjectRef = useRef<() => void>(() => {});
  const flowCacheRef = useRef<Record<string, FlowDocument>>({});
  const docUndoRef = useRef<{ ownerPath: string; doc: FlowDocument }[]>([]);
  const savedDigestRef = useRef<Record<string, string>>({});
  if (Object.keys(savedDigestRef.current).length === 0 && restoredWorkspace) {
    const rk =
      restoredWorkspace.activeEditorKey ??
      restoredWorkspace.activeFlowPath ??
      entryFlowPath(restoredWorkspace.project.manifest);
    savedDigestRef.current[rk] = restoredWorkspace.savedDigest;
  }
  const [logHeight, setLogHeight] = useState(140);

  const editor = useFlowEditor(project, {
    onConnectionRejected: (message) => setErrStatus(message),
    onConnectionNotice: (message) => setOkStatus(message),
  });

  const flushEditorToCache = useCallback(() => {
    try {
      const target = parseEditorKey(activeEditorKey);
      const ownerPath = ownerFilePath(activeEditorKey);
      const ownerDoc = flowCacheRef.current[ownerPath];
      if (!ownerDoc) {
        return;
      }
      flowCacheRef.current[ownerPath] = flushCanvasToDocument(
        target,
        ownerDoc,
        editor.toFlowGraph(),
        variables,
      );
      setSubflowTabIds(listSubflowIds(flowCacheRef.current[ownerPath]));
    } catch {
      // Canvas not ready.
    }
  }, [activeEditorKey, editor, variables]);

  const syncProjectFromCanvas = useCallback((): FlowProject => {
    flushEditorToCache();
    const ownerPath = ownerFilePath(activeEditorKey);
    const doc = flowCacheRef.current[ownerPath];
    if (!doc) {
      return {
        ...project,
        flow: editor.toFlowGraph(),
        variables,
      };
    }
    return {
      ...project,
      flow: doc.graph,
      variables: doc.variables,
    };
  }, [activeEditorKey, editor, flushEditorToCache, project, variables]);

  const persistWorkspace = useCallback(() => {
    try {
      const current = syncProjectFromCanvas();
      writeWorkspaceSession({
        project: current,
        projectDir,
        savedDigest: editorDigest(current, activeEditorKey),
        activeFlowPath: activeEditorKey,
        activeEditorKey,
      });
    } catch {
      // Canvas not ready yet.
    }
  }, [activeEditorKey, projectDir, syncProjectFromCanvas]);

  const markSaved = useCallback((current: FlowProject, editorKey: string) => {
    savedDigestRef.current[editorKey] = editorDigest(current, editorKey);
  }, []);

  const viewProjectForEditorKey = useCallback(
    (editorKey: string): FlowProject | null => {
      try {
        const target = parseEditorKey(editorKey);
        const ownerPath = ownerFilePath(editorKey);
        const ownerDoc = flowCacheRef.current[ownerPath];
        if (!ownerDoc) {
          return null;
        }
        const merged = flushCanvasToDocument(
          target,
          ownerDoc,
          editor.toFlowGraph(),
          variables,
        );
        const view = documentForEditorTarget(merged, target);
        return { ...project, flow: view.graph, variables: view.variables };
      } catch {
        return null;
      }
    },
    [editor, project, variables],
  );

  const hasUnsavedChanges = useCallback((): boolean => {
    const viewProject = viewProjectForEditorKey(activeEditorKey);
    if (!viewProject) return true;
    const saved = savedDigestRef.current[activeEditorKey];
    if (!saved) return true;
    return editorDigest(viewProject, activeEditorKey) !== saved;
  }, [activeEditorKey, viewProjectForEditorKey]);

  const dirtyFlowPaths = useMemo(() => {
    const dirty = new Set<string>();
    const viewProject = viewProjectForEditorKey(activeEditorKey);
    if (!viewProject) {
      dirty.add(activeEditorKey);
      return dirty;
    }
    const digest = editorDigest(viewProject, activeEditorKey);
    if (savedDigestRef.current[activeEditorKey] !== digest) {
      dirty.add(activeEditorKey);
    }
    return dirty;
  }, [activeEditorKey, editor.nodes, editor.edges, variables, viewProjectForEditorKey]);

  const activeSubflowId = useMemo(() => {
    const t = parseEditorKey(activeEditorKey);
    return t.kind === "subflow" ? t.subflowId : null;
  }, [activeEditorKey]);

  const visibleTabs = useMemo((): ProjectFlowEntry[] => {
    const owner = ownerFilePath(activeEditorKey);
    const subTabs: ProjectFlowEntry[] = subflowTabIds.map((id) => ({
      id: `subflow:${id}`,
      path: subflowEditorKey(owner, id),
      kind: "subflow",
      description: `Embedded subflow in ${owner}`,
    }));
    return [...flowTabs, ...subTabs];
  }, [activeEditorKey, flowTabs, subflowTabIds]);

  const syncProjectRef = useRef(syncProjectFromCanvas);
  syncProjectRef.current = syncProjectFromCanvas;
  const projectDirRef = useRef(projectDir);
  projectDirRef.current = projectDir;
  const activeEditorKeyRef = useRef(activeEditorKey);
  activeEditorKeyRef.current = activeEditorKey;

  useEffect(() => {
    const persist = () => {
      try {
        const current = {
          ...syncProjectRef.current(),
        };
        writeWorkspaceSession({
          project: current,
          projectDir: projectDirRef.current,
          savedDigest: editorDigest(current, activeEditorKeyRef.current),
          activeFlowPath: activeEditorKeyRef.current,
          activeEditorKey: activeEditorKeyRef.current,
        });
      } catch {
        // ignore
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        persist();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", persist);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", persist);
    };
  }, []);

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
        if (e.kind === "run_started") {
          setLastRunVariablesByNode({});
        }
        if (e.kind === "node_enter") setActiveNodeId(e.node_id);
        if (e.kind === "run_finished") setActiveNodeId(null);
        if (e.kind === "action_executed" && e.variables && Object.keys(e.variables).length > 0) {
          setLastRunVariablesByNode((prev) => ({
            ...prev,
            [e.node_id]: e.variables!,
          }));
        }
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

  const lastRunVariablesForSelection = selectedId
    ? lastRunVariablesByNode[selectedId]
    : undefined;

  const loadEditorKey = useCallback(
    (editorKey: string, docView: FlowDocument) => {
      const next: FlowProject = {
        ...project,
        flow: docView.graph,
        variables: docView.variables,
      };
      setProject(next);
      setVariables(docView.variables);
      editor.loadProject(next);
      setActiveEditorKey(editorKey);
      setSelectedId(null);
      markSaved(next, editorKey);
    },
    [editor, markSaved, project],
  );

  const pushDocUndo = useCallback((ownerPath: string) => {
    const doc = flowCacheRef.current[ownerPath];
    if (!doc) return;
    docUndoRef.current.push({ ownerPath, doc: structuredClone(doc) });
    if (docUndoRef.current.length > 40) {
      docUndoRef.current.shift();
    }
  }, []);

  const restoreDocUndo = useCallback((): boolean => {
    const entry = docUndoRef.current.pop();
    if (!entry) return false;
    flowCacheRef.current[entry.ownerPath] = entry.doc;
    setSubflowTabIds(listSubflowIds(entry.doc));
    const target = parseEditorKey(activeEditorKeyRef.current);
    if (ownerFilePath(activeEditorKeyRef.current) !== entry.ownerPath) {
      return true;
    }
    const view = documentForEditorTarget(entry.doc, target);
    const next: FlowProject = {
      ...project,
      flow: view.graph,
      variables: view.variables,
    };
    setProject(next);
    setVariables(view.variables);
    editor.applyProjectView(next);
    editor.commitHistory();
    return true;
  }, [editor, project]);

  const switchEditorTab = async (editorKey: string) => {
    if (editorKey === activeEditorKey || !projectDir) return;
    try {
      const sameOwner = ownerFilePath(editorKey) === ownerFilePath(activeEditorKey);
      if (!sameOwner && hasUnsavedChanges()) {
        const proceed = await confirm(
          "You have unsaved changes on this flow. Switch anyway?",
          { title: "Unsaved changes", kind: "warning" },
        );
        if (!proceed) return;
      }
      flushEditorToCache();
      const target = parseEditorKey(editorKey);
      const ownerPath = ownerFilePath(editorKey);
      if (target.kind === "file") {
        let doc = flowCacheRef.current[ownerPath];
        if (!doc) {
          doc = await invoke<FlowDocument>("load_flow_document_cmd", {
            path: projectDir,
            relative: ownerPath,
          });
          flowCacheRef.current[ownerPath] = doc;
        }
        setSubflowTabIds(listSubflowIds(doc));
        loadEditorKey(editorKey, documentForEditorTarget(doc, target));
        setOkStatus(`Editing ${ownerPath}`);
        return;
      }
      let ownerDoc = flowCacheRef.current[ownerPath];
      if (!ownerDoc) {
        ownerDoc = await invoke<FlowDocument>("load_flow_document_cmd", {
          path: projectDir,
          relative: ownerPath,
        });
        flowCacheRef.current[ownerPath] = ownerDoc;
      }
      setSubflowTabIds(listSubflowIds(ownerDoc));
      loadEditorKey(editorKey, documentForEditorTarget(ownerDoc, target));
      setOkStatus(`Subflow ${target.subflowId} (${ownerPath})`);
    } catch (e) {
      setErrStatus(`Open flow failed: ${formatError(e)}`);
    }
  };

  const addSubflow = useCallback(async () => {
    if (isSubflowEditor(activeEditorKey)) {
      setErrStatus("Create subflows from the main flow tab, not inside another subflow.");
      return;
    }
    if (!projectDir) {
      setErrStatus("Save the project to a folder before adding subflows.");
      return;
    }
    flushEditorToCache();
    const ownerPath = ownerFilePath(activeEditorKey);
    const ownerDoc = flowCacheRef.current[ownerPath];
    if (!ownerDoc) {
      setErrStatus("Open a flow file first.");
      return;
    }
    const id = newSubflowId(Object.keys(ownerDoc.graph.subflows ?? {}));
    const bundle = defaultSubflowBundle(id);
    ownerDoc.graph.subflows = { ...(ownerDoc.graph.subflows ?? {}), [id]: bundle };
    flowCacheRef.current[ownerPath] = ownerDoc;
    setSubflowTabIds(listSubflowIds(ownerDoc));
    await switchEditorTab(subflowEditorKey(ownerPath, id));
    setOkStatus(`Created subflow "${id}"`);
  }, [activeEditorKey, flushEditorToCache, projectDir, switchEditorTab]);

  const editSubflow = useCallback(
    (subflowId: string) => {
      const ownerPath = ownerFilePath(activeEditorKey);
      void switchEditorTab(subflowEditorKey(ownerPath, subflowId));
    },
    [activeEditorKey, switchEditorTab],
  );

  const reloadMainViewIfActive = useCallback(
    (ownerPath: string) => {
      const doc = flowCacheRef.current[ownerPath];
      if (!doc) return;
      if (ownerFilePath(activeEditorKey) === ownerPath && !isSubflowEditor(activeEditorKey)) {
        const view = documentForEditorTarget(doc, { kind: "file", path: ownerPath });
        loadEditorKey(ownerPath, view);
      }
    },
    [activeEditorKey, loadEditorKey],
  );

  const renameSubflow = useCallback(
    (subflowId: string, newId: string) => {
      flushEditorToCache();
      const ownerPath = ownerFilePath(activeEditorKey);
      const ownerDoc = flowCacheRef.current[ownerPath];
      if (!ownerDoc) {
        setErrStatus("Flow document not loaded.");
        return;
      }
      pushDocUndo(ownerPath);
      editor.commitHistory();
      const result = renameSubflowInDocument(ownerDoc, subflowId, newId);
      if (!result.ok) {
        docUndoRef.current.pop();
        setErrStatus(result.error);
        return;
      }
      flowCacheRef.current[ownerPath] = result.doc;
      setSubflowTabIds(listSubflowIds(result.doc));
      const activeTarget = parseEditorKey(activeEditorKey);
      const onSubflowTab =
        activeTarget.kind === "subflow" && activeTarget.subflowId === subflowId;
      if (onSubflowTab) {
        const view = documentForEditorTarget(result.doc, {
          kind: "subflow",
          ownerPath,
          subflowId: newId,
        });
        loadEditorKey(subflowEditorKey(ownerPath, newId), view);
      } else {
        reloadMainViewIfActive(ownerPath);
      }
      editor.commitHistory();
      const extra =
        result.updatedRunFlowNodes > 0
          ? ` · updated ${result.updatedRunFlowNodes} run_flow node(s)`
          : "";
      setOkStatus(`Renamed subflow ${subflowId} → ${newId}${extra}`);
    },
    [activeEditorKey, editor, flushEditorToCache, loadEditorKey, pushDocUndo, reloadMainViewIfActive],
  );

  const deleteSubflow = useCallback(
    async (subflowId: string) => {
      const ownerPath = ownerFilePath(activeEditorKey);
      const proceed = await confirm(
        `Delete embedded subflow "${subflowId}" from ${ownerPath}? Run flow nodes pointing to it will lose flow_id.`,
        { title: "Delete subflow", kind: "warning" },
      );
      if (!proceed) return;
      flushEditorToCache();
      const ownerDoc = flowCacheRef.current[ownerPath];
      if (!ownerDoc) {
        setErrStatus("Flow document not loaded.");
        return;
      }
      pushDocUndo(ownerPath);
      editor.commitHistory();
      const result = deleteSubflowFromDocument(ownerDoc, subflowId);
      if (!result.ok) {
        docUndoRef.current.pop();
        setErrStatus(result.error);
        return;
      }
      flowCacheRef.current[ownerPath] = result.doc;
      setSubflowTabIds(listSubflowIds(result.doc));
      const activeTarget = parseEditorKey(activeEditorKey);
      const wasEditingDeleted =
        activeTarget.kind === "subflow" && activeTarget.subflowId === subflowId;
      if (wasEditingDeleted) {
        const view = documentForEditorTarget(result.doc, { kind: "file", path: ownerPath });
        loadEditorKey(ownerPath, view);
      } else {
        reloadMainViewIfActive(ownerPath);
      }
      editor.commitHistory();
      const extra =
        result.clearedRunFlowNodes > 0
          ? ` · cleared ${result.clearedRunFlowNodes} run_flow reference(s)`
          : "";
      setOkStatus(`Deleted subflow "${subflowId}"${extra}`);
    },
    [activeEditorKey, editor, flushEditorToCache, loadEditorKey, pushDocUndo, reloadMainViewIfActive],
  );

  const clearFlow = async () => {
    if (running) {
      return;
    }
    try {
      const proceed = await confirm(
        "Remover todos os nós e conexões do fluxo e limpar as variáveis do projeto? O diagrama ficará apenas com Start e End.",
        { title: "Limpar fluxo", kind: "warning" },
      );
      if (!proceed) {
        return;
      }
      const current = syncProjectFromCanvas();
      const cleared = projectWithClearedFlow(current);
      setProject(cleared);
      setProjectDir(null);
      editor.loadProject(cleared);
      setVariables({});
      setSelectedId(null);
      persistWorkspace();
      setOkStatus("Fluxo limpo — escolha a pasta no Save (não sobrescreve o projeto anterior)");
    } catch (e) {
      setErrStatus(`Limpar fluxo falhou: ${formatError(e)}`);
    }
  };

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
      const tabs = await invoke<ProjectFlowEntry[]>("list_project_flows_cmd", { path: dir });
      const entry = entryFlowPath(loaded.manifest);
      setProjectDir(dir);
      setProject(loaded);
      setFlowTabs(tabs);
      setActiveEditorKey(entry);
      const fullDoc: FlowDocument = { graph: loaded.flow, variables: loaded.variables };
      flowCacheRef.current = { [entry]: fullDoc };
      setSubflowTabIds(listSubflowIds(fullDoc));
      const mainView = documentForEditorTarget(fullDoc, { kind: "file", path: entry });
      const mainProject: FlowProject = {
        ...loaded,
        flow: mainView.graph,
        variables: mainView.variables,
      };
      setProject(mainProject);
      editor.loadProject(mainProject);
      setVariables(mainView.variables);
      setLogLines([]);
      setSelectedId(null);
      markSaved(mainProject, entry);
      persistWorkspace();
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
      flushEditorToCache();
      const ownerPath = ownerFilePath(activeEditorKey);
      const doc = flowCacheRef.current[ownerPath];
      if (!doc) {
        setErrStatus("Nothing to save.");
        return;
      }
      const current = { ...project, flow: doc.graph, variables: doc.variables };
      const entry = entryFlowPath(current.manifest);
      await invoke("save_flow_document_cmd", {
        path: dir,
        relative: ownerPath,
        graph: doc.graph,
        variables: doc.variables,
      });
      await invoke("save_manifest_cmd", { path: dir, manifest: current.manifest });
      if (ownerPath === entry) {
        await invoke("save_project_cmd", { path: dir, project: current });
      }
      setProject(current);
      markSaved(viewProjectForEditorKey(activeEditorKey) ?? current, activeEditorKey);
      persistWorkspace();
      setOkStatus(`Saved ${ownerPath} → ${dir}`);
    } catch (e) {
      setErrStatus(`Save failed: ${formatError(e)}`);
    }
  };

  const validate = async () => {
    try {
      const current = syncProjectFromCanvas();
      await invoke("validate_project_cmd", { project: current });
      if (projectDir) {
        await invoke("validate_project_dir_cmd", { path: projectDir });
      }
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
      await invoke("validate_project_cmd", { project: current });
      if (projectDir) {
        await invoke("validate_project_dir_cmd", { path: projectDir });
      }
      let toRun = current;
      if (projectDir) {
        flushEditorToCache();
        const ownerPath = ownerFilePath(activeEditorKey);
        const doc = flowCacheRef.current[ownerPath];
        if (doc) {
          await invoke("save_flow_document_cmd", {
            path: projectDir,
            relative: ownerPath,
            graph: doc.graph,
            variables: doc.variables,
          });
        }
        toRun = await invoke<FlowProject>("load_project_cmd", { path: projectDir });
      }
      const last = await invoke<string>("run_flow_cmd", {
        project: toRun,
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
        } else if (!restoreDocUndo()) {
          editor.undo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, restoreDocUndo]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (!hasUnsavedChanges()) {
          return;
        }
        event.preventDefault();
        const proceed = await confirm(
          "You have unsaved changes. Close Hoblio Studio anyway?",
          { title: "Unsaved changes", kind: "warning" },
        );
        if (proceed) {
          await getCurrentWindow().destroy();
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [hasUnsavedChanges]);

  const flowNodes = useMemo(
    () => editor.nodes.map((n) => n.data.flowNode),
    [editor.nodes],
  );

  const addAction = (type: ActionKind["type"]) => editor.addAction(type, variables);

  const handleRenameFlowVariable = useCallback(
    (oldName: string, newName: string) => {
      editor.applyVariableRename(oldName, newName);
      setVariables((current) => renameVariableInSeed(current, oldName, newName));
    },
    [editor],
  );

  const focusFlowNode = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId);
      editor.selectNode(nodeId);
    },
    [editor],
  );

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
        {activeSubflowId ? <span className="path">Subflow: {activeSubflowId}</span> : null}
      </header>
      <FlowTabs
        tabs={visibleTabs}
        activePath={activeEditorKey}
        dirtyPaths={dirtyFlowPaths}
        onSelect={(path) => void switchEditorTab(path)}
      />
      <div className="main">
        <aside className="panel palette">
          <h3>Palette</h3>
          <h4 className="palette-group">Utilitários</h4>
          <button type="button" onClick={() => addAction("log")}>
            Log
          </button>
          <button type="button" onClick={() => addAction("no_op")}>
            NoOp
          </button>
          <button type="button" onClick={() => addAction("delay")}>
            Delay
          </button>
          <button type="button" onClick={() => addAction("http_get")}>
            HttpGet
          </button>
          <h4 className="palette-group">Cx Mensagens</h4>
          <button type="button" onClick={() => addAction("show_message")}>
            ShowMessage
          </button>
          <button type="button" onClick={() => addAction("show_get_user_input")}>
            ShowGetUserInput
          </button>
          <h4 className="palette-group">Arquivos</h4>
          <button type="button" onClick={() => addAction("file_write")}>
            FileWrite
          </button>
          <button type="button" onClick={() => addAction("file_append")}>
            FileAppend
          </button>
          <button type="button" onClick={() => addAction("file_read")}>
            FileRead
          </button>
          <h4 className="palette-group">Browser</h4>
          <button type="button" onClick={() => addAction("browser_navigate")}>
            BrowserNavigate
          </button>
          <button type="button" onClick={() => addAction("browser_click")}>
            BrowserClick
          </button>
          <button type="button" onClick={() => addAction("browser_wait_navigation")}>
            Wait navigation
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
          <hr className="palette-divider" />
          <h4 className="palette-group">Variables</h4>
          <button type="button" onClick={() => addAction("set_variable")}>
            Set variable
          </button>
          <button type="button" onClick={() => addAction("increase_variable")}>
            Increase variable
          </button>
          <button type="button" onClick={() => addAction("decrease_variable")}>
            Decrease variable
          </button>
          <button type="button" onClick={() => addAction("list_clear")}>
            List clear
          </button>
          <button type="button" onClick={() => addAction("list_append")}>
            List append
          </button>
          <hr className="palette-divider" />
          <h4 className="palette-group">Fluxos</h4>
          <button type="button" onClick={() => addAction("run_flow")}>
            Run flow
          </button>
          <button type="button" onClick={() => void addSubflow()}>
            New subflow
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
          <button type="button" onClick={() => editor.addControlNode("while_loop")}>
            While
          </button>
          <button type="button" onClick={() => editor.addControlNode("repeat")}>
            Repeat N times
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
          <FlowCanvas
            controller={editorWithActive}
            onSelectNodeId={setSelectedId}
            onClearFlow={() => void clearFlow()}
          />
        </div>
        <PropertiesPanel
          node={selectedNode}
          flowNodes={flowNodes}
          editing={editor.editing}
          variables={variables}
          embeddedSubflowIds={subflowTabIds}
          onEditSubflow={editSubflow}
          subflowContext={
            activeSubflowId
              ? { id: activeSubflowId, ownerPath: ownerFilePath(activeEditorKey) }
              : null
          }
          subflowOwnerPath={ownerFilePath(activeEditorKey)}
          onRenameSubflow={renameSubflow}
          onDeleteSubflow={(id) => void deleteSubflow(id)}
          variablesTitle={
            activeSubflowId
              ? `Subflow variables (${activeSubflowId})`
              : `Project variables (${ownerFilePath(activeEditorKey)})`
          }
          lastRunVariables={lastRunVariablesForSelection}
          onVariablesChange={setVariables}
          onSelectFlowNode={focusFlowNode}
          onRenameFlowVariable={handleRenameFlowVariable}
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
