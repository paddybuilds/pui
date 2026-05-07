import type { PuiApi, ShellCandidate } from "../../../preload";
import { DEFAULT_APP_PREFERENCES } from "../../../shared/types";
import type {
  AppSettings,
  AppUpdateCheckResult,
  AppVersionInfo,
  ConsoleProfile,
  GitBranch,
  GitCommit,
  GitCommitDetails,
  GitCommitFileDiff,
  GitDiff,
  GitOperationResult,
  GitStatus,
  SettingsLoadState,
  TerminalSession
} from "../../../shared/types";
import { terminalBridge } from "./terminalBridge";

const isPreviewWindows = navigator.platform.toLowerCase().includes("win");
const workspace = isPreviewWindows ? "C:\\Users\\paddy\\Documents\\GitHub\\pui" : "/Users/paddy/Documents/GitHub/pui";
const defaultShell = isPreviewWindows
  ? { id: "preview-powershell", name: "PowerShell", command: "powershell.exe", args: ["-NoLogo"] }
  : { id: "preview-zsh", name: "zsh", command: "/bin/zsh", args: [] };

const defaultProfiles: ConsoleProfile[] = [
  {
    id: defaultShell.id,
    name: defaultShell.name,
    cwd: workspace,
    command: defaultShell.command,
    args: defaultShell.args,
    env: {},
    shortcut: "CmdOrCtrl+1",
    appearance: { color: "#9ca3af", icon: "terminal" }
  }
];

let settings: AppSettings = {
  workspace,
  profiles: defaultProfiles,
  recentWorkspaces: [workspace],
  appPreferences: {
    ...DEFAULT_APP_PREFERENCES
  },
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
      },
      layoutPresets: [],
      quickCommands: []
    }
  ]
};

const noopUnsubscribe = () => undefined;
const bridgeBaseUrl = "http://127.0.0.1:4317";
const previewVersion = "0.1.0";

export function getPuiApi(): PuiApi {
  if (!window.pui) {
    if (navigator.userAgent.includes("Electron")) {
      throw new Error("Pui preload API did not load in Electron.");
    }
    window.pui = browserPreviewApi;
  }
  return window.pui;
}

const browserPreviewApi: PuiApi = {
  platform: navigator.platform.toLowerCase().includes("mac") ? "darwin" : isPreviewWindows ? "win32" : "linux",
  app: {
    getVersionInfo: async (): Promise<AppVersionInfo> => ({
      name: "pui",
      version: previewVersion,
      commitSha: "preview",
      commitShortSha: "preview",
      updateCheckConfigured: false
    }),
    checkForUpdates: async (): Promise<AppUpdateCheckResult> => ({
      status: "unavailable",
      currentVersion: previewVersion,
      checkedAt: new Date().toISOString(),
      message: "Update checks are unavailable in browser preview."
    }),
    setTitleBarTheme: async () => undefined
  },
  dialog: {
    openFolder: async (defaultPath) =>
      bridgeGet<{ path?: string }>("/dialog/open-folder", { defaultPath: defaultPath || workspace })
        .then((result) => result.path)
        .catch(() => window.prompt("Folder path", defaultPath || workspace)?.trim() || undefined)
  },
  settings: {
    loadState: async (): Promise<SettingsLoadState> => ({ settings, isFirstLaunch: false }),
    load: async () => settings,
    save: async (next) => {
      settings = next;
      return settings;
    }
  },
  system: {
    listShells: async () => previewShellCandidates(browserPreviewApi.platform)
  },
  terminal: {
    create: (payload) =>
      terminalBridge
        .create(payload as { profile: ConsoleProfile; paneId: string; cols: number; rows: number })
        .catch(() => {
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
  git: {
    status: (gitWorkspace) => bridgeGet<GitStatus>("/git/status", { workspace: gitWorkspace }),
    branches: (gitWorkspace) => bridgeGet<GitBranch[]>("/git/branches", { workspace: gitWorkspace }),
    switchBranch: (gitWorkspace, branch) =>
      bridgePost<GitOperationResult>("/git/switch-branch", { workspace: gitWorkspace, branch }).catch((error) => ({
        ok: false,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error)
      })),
    diff: (gitWorkspace, file, cached = false) =>
      bridgeGet<GitDiff>("/git/diff", { workspace: gitWorkspace, file: file || "", cached: String(cached) }),
    commits: (gitWorkspace, limit = 16) =>
      bridgeGet<GitCommit[]>("/git/commits", { workspace: gitWorkspace, limit: String(limit) }),
    commitDetails: (gitWorkspace, hash) =>
      bridgeGet<GitCommitDetails>("/git/commit-details", { workspace: gitWorkspace, hash }),
    commitFileDiff: (gitWorkspace, hash, file) =>
      bridgeGet<GitCommitFileDiff>("/git/commit-file-diff", { workspace: gitWorkspace, hash, file }),
    stage: (gitWorkspace, paths) => bridgePost<GitStatus>("/git/stage", { workspace: gitWorkspace, paths }),
    unstage: (gitWorkspace, paths) => bridgePost<GitStatus>("/git/unstage", { workspace: gitWorkspace, paths }),
    discard: (gitWorkspace, paths) => bridgePost<GitStatus>("/git/discard", { workspace: gitWorkspace, paths }),
    commit: (gitWorkspace, message) =>
      bridgePost<GitOperationResult>("/git/commit", { workspace: gitWorkspace, message }).catch((error) => ({
        ok: false,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error)
      })),
    push: (gitWorkspace) =>
      bridgePost<GitOperationResult>("/git/push", { workspace: gitWorkspace }).catch((error) => ({
        ok: false,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error)
      })),
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

function previewShellCandidates(platform: NodeJS.Platform): ShellCandidate[] {
  if (platform === "win32") {
    return [
      {
        id: "powershell",
        name: "Windows PowerShell",
        command: "powershell.exe",
        args: ["-NoLogo"],
        source: "system",
        available: true
      },
      {
        id: "pwsh",
        name: "PowerShell",
        command: "pwsh.exe",
        args: ["-NoLogo"],
        source: "system",
        available: false
      },
      {
        id: "cmd",
        name: "Command Prompt",
        command: "cmd.exe",
        args: [],
        source: "system",
        available: true
      },
      {
        id: "wsl",
        name: "WSL",
        command: "wsl.exe",
        args: [],
        source: "wsl",
        available: false
      },
      customShellCandidate()
    ];
  }

  const shell = platform === "darwin" ? "/bin/zsh" : "/bin/bash";
  return [
    {
      id: `env-${platform === "darwin" ? "zsh" : "bash"}`,
      name: platform === "darwin" ? "zsh" : "bash",
      command: shell,
      args: [],
      source: "environment",
      available: true
    },
    {
      id: "zsh",
      name: "zsh",
      command: "/bin/zsh",
      args: [],
      source: "system",
      available: platform === "darwin"
    },
    {
      id: "bash",
      name: "bash",
      command: "/bin/bash",
      args: [],
      source: "system",
      available: true
    },
    {
      id: "sh",
      name: "sh",
      command: "/bin/sh",
      args: [],
      source: "system",
      available: true
    },
    customShellCandidate()
  ];
}

function customShellCandidate(): ShellCandidate {
  return {
    id: "custom",
    name: "Custom",
    command: "",
    args: [],
    source: "custom",
    available: true
  };
}
