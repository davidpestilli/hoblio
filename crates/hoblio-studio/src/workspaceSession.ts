import type { FlowProject } from "./model";

const SESSION_KEY = "hoblio-studio-workspace-v1";

export type WorkspaceSession = {
  project: FlowProject;
  projectDir: string | null;
  savedDigest: string;
  /** File path or subflow editor key (`flow.json#subflow:id`). */
  activeFlowPath?: string;
  activeEditorKey?: string;
};

export function readWorkspaceSession(): WorkspaceSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as WorkspaceSession;
    if (!parsed?.project?.flow) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeWorkspaceSession(session: WorkspaceSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Quota or private mode — ignore.
  }
}

export function clearWorkspaceSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
