import type { PuiApi } from "../../../preload";
import type { AppSettings, CodexRun, ConsoleProfile, GitDiff, GitStatus, TerminalSession } from "../../../shared/types";
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

export function getPuiApi(): PuiApi {
  if (!window.pui) {
    window.pui = browserPreviewApi;
  }
  return window.pui;
}

const browserPreviewApi: PuiApi = {
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
    status: async (gitWorkspace) =>
      ({
        workspace: gitWorkspace,
        isRepo: false,
        files: [],
        error: "Git integration is available in the Electron app window."
      }) satisfies GitStatus,
    diff: async (gitWorkspace, file, cached = false) =>
      ({
        workspace: gitWorkspace,
        file,
        cached,
        text: ""
      }) satisfies GitDiff,
    stage: async (gitWorkspace) => browserPreviewApi.git.status(gitWorkspace),
    unstage: async (gitWorkspace) => browserPreviewApi.git.status(gitWorkspace),
    discard: async (gitWorkspace) => browserPreviewApi.git.status(gitWorkspace),
    watch: async () => undefined,
    onChanged: () => noopUnsubscribe
  }
};
