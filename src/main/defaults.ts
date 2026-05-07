import { homedir } from "node:os";
import {
  DEFAULT_APP_PREFERENCES,
  type AppSettings,
  type ConsoleProfile,
  type TerminalWorkspace
} from "../shared/types";
import { defaultShell } from "./shell";

export function defaultProfiles(workspace: string): ConsoleProfile[] {
  const shell = defaultShell();
  return [
    {
      id: "default-shell",
      name: shell.name,
      cwd: workspace,
      command: shell.command,
      args: shell.args,
      env: {},
      shortcut: "CmdOrCtrl+1",
      appearance: {
        color: "#9ca3af",
        icon: "terminal"
      }
    },
    {
      id: "codex-interactive",
      name: "Codex",
      cwd: workspace,
      command: "codex",
      args: [],
      env: {},
      shortcut: "CmdOrCtrl+2",
      appearance: {
        color: "#9ca3af",
        icon: "sparkles"
      }
    }
  ];
}

export function defaultSettings(): AppSettings {
  const workspace = process.cwd() || homedir();
  const profiles = defaultProfiles(workspace);
  const defaultWorkspace: TerminalWorkspace = {
    id: "main-workspace",
    name: "pui",
    kind: "folder",
    path: workspace,
    defaultCwd: workspace,
    terminalFontSize: 13,
    profiles,
    layout: {
      activePaneId: "main-pane",
      root: { type: "pane", id: "main-pane", profileId: profiles[0]?.id }
    },
    layoutPresets: [],
    quickCommands: []
  };

  return {
    workspace,
    profiles,
    recentWorkspaces: [workspace],
    appPreferences: {
      ...DEFAULT_APP_PREFERENCES,
      defaultTerminalProfileId: profiles[0]?.id
    },
    activeWorkspaceId: defaultWorkspace.id,
    workspaces: [defaultWorkspace],
    layout: undefined
  };
}
