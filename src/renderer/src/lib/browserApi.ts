import type { PuiApi } from "../../../preload";
import type { AppSettings, CodexRun, ConsoleProfile, GitCommit, GitDiff, GitStatus, TerminalSession } from "../../../shared/types";
import { terminalBridge } from "./terminalBridge";

const workspace = "/Users/paddy/Documents/GitHub/pui";

const defaultProfiles: ConsoleProfile[] = [
  {
    id: "preview-zsh",
    name: "zsh",
    cwd: workspace,
    command: "/bin/zsh",
    args: [],
    env: {},
    shortcut: "CmdOrCtrl+1",
    appearance: { color: "#9ca3af", icon: "terminal" }
  },
  {
    id: "preview-codex",
    name: "Codex",
    cwd: workspace,
    command: "codex",
    args: [],
    env: {},
    shortcut: "CmdOrCtrl+2",
    appearance: { color: "#9ca3af", icon: "sparkles" }
  }
];

let settings: AppSettings = {
  workspace,
  profiles: defaultProfiles,
  recentWorkspaces: [workspace],
  activeWorkspaceId: "preview-workspace",
  workspaces: [
    {
      id: "preview-workspace",
      name: "pui",
      kind: "folder",
      path: workspace,
      defaultCwd: workspace,
      terminalFontSize: 13,
      profiles: defaultProfiles,
      layout: {
        activePaneId: "preview-pane",
        root: { type: "pane", id: "preview-pane", profileId: defaultProfiles[0]?.id }
      }
    }
  ]
};

const noopUnsubscribe = () => undefined;
const bridgeBaseUrl = "http://127.0.0.1:4317";

export function getPuiApi(): PuiApi {
  if (!window.pui) {
    window.pui = browserPreviewApi;
  }
  return window.pui;
}

const browserPreviewApi: PuiApi = {
  platform: navigator.platform.toLowerCase().includes("mac") ? "darwin" : "linux",
  dialog: {
    openFolder: async (defaultPath) =>
      bridgeGet<{ path?: string }>("/dialog/open-folder", { defaultPath: defaultPath || workspace })
        .then((result) => result.path)
        .catch(() => window.prompt("Folder path", defaultPath || workspace) || undefined)
  },
  settings: {
    load: async () => settings,
    save: async (next) => {
      settings = next;
      return settings;
    }
  },
  terminal: {
    create: (payload) =>
      terminalBridge.create(payload as { profile: ConsoleProfile; paneId: string; cols: number; rows: number }).catch(() => {
        const { profile, paneId } = payload as { profile: ConsoleProfile; paneId: string };
        return {
          id: crypto.randomUUID(),
          profileId: profile.id,
          cwd: profile.cwd,
          paneId,
          ptyProcessId: 0,
          status: "running"
        } satisfies TerminalSession;
      }),
    write: (sessionId, data) => terminalBridge.write(sessionId, data),
    resize: (sessionId, cols, rows) => terminalBridge.resize(sessionId, cols, rows),
    kill: (sessionId) => terminalBridge.kill(sessionId),
    onData: (callback) => terminalBridge.onData(callback),
    onExit: (callback) => terminalBridge.onExit(callback)
  },
  codex: {
    run: async (prompt, runWorkspace) =>
      ({
        id: crypto.randomUUID(),
        workspace: runWorkspace,
        prompt,
        status: "completed",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        events: [
          {
            timestamp: new Date().toISOString(),
            type: "preview",
            message: "Codex runs are available in the Electron app window.",
            raw: null
          }
        ],
        exitCode: 0
      }) satisfies CodexRun,
    cancel: async () => undefined,
    onEvent: () => noopUnsubscribe,
    onUpdate: () => noopUnsubscribe
  },
  git: {
    status: (gitWorkspace) => bridgeGet<GitStatus>("/git/status", { workspace: gitWorkspace }),
    diff: (gitWorkspace, file, cached = false) =>
      bridgeGet<GitDiff>("/git/diff", { workspace: gitWorkspace, file: file || "", cached: String(cached) }),
    commits: (gitWorkspace, limit = 16) =>
      bridgeGet<GitCommit[]>("/git/commits", { workspace: gitWorkspace, limit: String(limit) }),
    stage: (gitWorkspace, paths) => bridgePost<GitStatus>("/git/stage", { workspace: gitWorkspace, paths }),
    unstage: (gitWorkspace, paths) => bridgePost<GitStatus>("/git/unstage", { workspace: gitWorkspace, paths }),
    discard: (gitWorkspace, paths) => bridgePost<GitStatus>("/git/discard", { workspace: gitWorkspace, paths }),
    watch: async () => undefined,
    onChanged: () => noopUnsubscribe
  }
};

async function bridgeGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, bridgeBaseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  const response = await fetch(url);
  return parseBridgeResponse<T>(response);
}

async function bridgePost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(new URL(path, bridgeBaseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseBridgeResponse<T>(response);
}

async function parseBridgeResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || `Bridge request failed: ${response.status}`);
  }
  return payload as T;
}
