import { homedir } from "node:os";
import type { AppSettings, ConsoleProfile, TerminalWorkspace } from "../shared/types";

export function defaultProfiles(workspace: string): ConsoleProfile[] {
  return [
    {
      id: "default-zsh",
      name: "zsh",
      cwd: workspace,
      command: process.env.SHELL || "/bin/zsh",
      args: [],
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
    }
  };

  return {
    workspace,
    profiles,
    recentWorkspaces: [workspace],
    activeWorkspaceId: defaultWorkspace.id,
    workspaces: [defaultWorkspace],
    layout: undefined
  };
}
