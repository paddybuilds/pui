import type { AppSettings, ConsoleProfile, TerminalWorkspace } from "../../../shared/types";
import { normalizeWorkspaceWorkflow } from "../../../shared/workflow";

export type IdFactory = () => string;

export const createWorkspaceSettingsId: IdFactory = () => crypto.randomUUID();

export type InitialWorkspaceOptions = {
  name: string;
  path: string;
  defaultCwd: string;
  terminalFontSize: number;
  includeCodexProfile: boolean;
};

export function normalizeSettings(
  settings: AppSettings,
  platform: string,
  idFactory: IdFactory = createWorkspaceSettingsId
): AppSettings {
  if (settings.workspaces) {
    const workspaces = settings.workspaces.map((workspace) =>
      normalizeWorkspaceWorkflow({
        ...workspace,
        kind: workspace.kind ?? ("folder" as const),
        defaultCwd: workspace.defaultCwd || workspace.path,
        terminalFontSize: workspace.terminalFontSize || 13,
        profiles: workspace.profiles.map((profile) => ({
          ...profile,
          cwd: profile.cwd || workspace.defaultCwd || workspace.path
        }))
      })
    );
    const activeWorkspaceId = workspaces.some((workspace) => workspace.id === settings.activeWorkspaceId)
      ? settings.activeWorkspaceId
      : workspaces[0]?.id;
    return { ...settings, activeWorkspaceId, workspaces };
  }

  const path = settings.workspace;
  const profiles =
    settings.profiles.length > 0 ? settings.profiles : [createShellProfile(path, "CmdOrCtrl+1", platform, idFactory)];
  const paneId = idFactory();
  const workspace: TerminalWorkspace = {
    id: "main-workspace",
    name: basename(path) || "workspace",
    kind: "folder",
    path,
    defaultCwd: path,
    terminalFontSize: 13,
    profiles: profiles.map((profile, index) => ({ ...profile, cwd: path, shortcut: `CmdOrCtrl+${index + 1}` })),
    layout: {
      activePaneId: paneId,
      root: { type: "pane", id: paneId, profileId: profiles[0]?.id }
    },
    layoutPresets: [],
    quickCommands: []
  };

  return {
    ...settings,
    activeWorkspaceId: workspace.id,
    workspaces: [workspace]
  };
}

export function createShellProfile(
  path: string,
  shortcut: string,
  platform: string,
  idFactory: IdFactory = createWorkspaceSettingsId
): ConsoleProfile {
  const shell = defaultShellProfile(platform);
  return {
    id: idFactory(),
    name: shell.name,
    cwd: path,
    command: shell.command,
    args: shell.args,
    env: {},
    shortcut,
    appearance: {
      color: "#9ca3af",
      icon: "terminal"
    }
  };
}

export function createCodexProfile(
  path: string,
  shortcut: string,
  idFactory: IdFactory = createWorkspaceSettingsId
): ConsoleProfile {
  return {
    id: idFactory(),
    name: "Codex",
    cwd: path,
    command: "codex",
    args: [],
    env: {},
    shortcut,
    appearance: {
      color: "#9ca3af",
      icon: "sparkles"
    }
  };
}

export function createInitialWorkspaceSettings(
  settings: AppSettings,
  options: InitialWorkspaceOptions,
  platform: string,
  idFactory: IdFactory = createWorkspaceSettingsId
): AppSettings {
  const path = options.path.trim() || settings.workspace;
  const defaultCwd = options.defaultCwd.trim() || path;
  const name = options.name.trim() || basename(path) || "workspace";
  const shellProfile = createShellProfile(defaultCwd, "CmdOrCtrl+1", platform, idFactory);
  const profiles = options.includeCodexProfile
    ? [shellProfile, createCodexProfile(defaultCwd, "CmdOrCtrl+2", idFactory)]
    : [shellProfile];
  const paneId = idFactory();
  const workspace: TerminalWorkspace = normalizeWorkspaceWorkflow({
    id: idFactory(),
    name,
    kind: "folder",
    path,
    defaultCwd,
    terminalFontSize: normalizeTerminalFontSize(options.terminalFontSize),
    profiles,
    layout: {
      activePaneId: paneId,
      root: { type: "pane", id: paneId, profileId: shellProfile.id }
    },
    layoutPresets: [],
    quickCommands: []
  });

  return {
    ...settings,
    workspace: path,
    profiles,
    recentWorkspaces: Array.from(new Set([path, ...settings.recentWorkspaces].filter(Boolean))).slice(0, 12),
    activeWorkspaceId: workspace.id,
    workspaces: [workspace],
    layout: undefined
  };
}

export function defaultShellProfile(platform: string): { name: string; command: string; args: string[] } {
  if (platform === "win32") {
    return { name: "PowerShell", command: "powershell.exe", args: ["-NoLogo"] };
  }
  return { name: "zsh", command: "/bin/zsh", args: [] };
}

export function normalizeTerminalFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 13;
  }
  return Math.min(24, Math.max(10, Math.round(value)));
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
