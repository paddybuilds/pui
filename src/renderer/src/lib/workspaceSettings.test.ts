import { describe, expect, it } from "vitest";
import type { AppSettings } from "../../../shared/types";
import {
  basename,
  createInitialWorkspaceSettings,
  createShellProfile,
  defaultShellProfile,
  normalizeSettings,
  normalizeTerminalFontSize
} from "./workspaceSettings";

function idFactory(ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

describe("workspace settings helpers", () => {
  it("migrates legacy settings into the persisted workspace shape", () => {
    const settings: AppSettings = {
      workspace: "C:\\Repos\\pui",
      profiles: [],
      recentWorkspaces: ["C:\\Repos\\pui"]
    };

    expect(normalizeSettings(settings, "win32", idFactory(["profile-a", "pane-a"]))).toEqual({
      ...settings,
      activeWorkspaceId: "main-workspace",
      workspaces: [
        {
          id: "main-workspace",
          name: "pui",
          kind: "folder",
          path: "C:\\Repos\\pui",
          defaultCwd: "C:\\Repos\\pui",
          terminalFontSize: 13,
          profiles: [
            {
              id: "profile-a",
              name: "PowerShell",
              cwd: "C:\\Repos\\pui",
              command: "powershell.exe",
              args: ["-NoLogo"],
              env: {},
              shortcut: "CmdOrCtrl+1",
              appearance: {
                color: "#9ca3af",
                icon: "terminal"
              }
            }
          ],
          layout: {
            activePaneId: "pane-a",
            root: { type: "pane", id: "pane-a", profileId: "profile-a" }
          },
          layoutPresets: [],
          quickCommands: []
        }
      ]
    });
  });

  it("normalizes existing workspaces without changing the top-level settings contract", () => {
    const settings: AppSettings = {
      workspace: "/repo/old",
      profiles: [],
      recentWorkspaces: ["/repo/old"],
      activeWorkspaceId: "missing",
      workspaces: [
        {
          id: "workspace-a",
          name: "Repo",
          path: "/repo/a",
          defaultCwd: "",
          terminalFontSize: 0,
          profiles: [
            {
              id: "profile-a",
              name: "Shell",
              cwd: "",
              command: "zsh",
              args: [],
              env: {},
              shortcut: "",
              appearance: { color: "#9ca3af", icon: "terminal" }
            }
          ],
          layout: {
            activePaneId: "pane-a",
            root: { type: "pane", id: "pane-a", profileId: "profile-a" }
          }
        }
      ]
    };

    expect(normalizeSettings(settings, "darwin")).toEqual({
      ...settings,
      activeWorkspaceId: "workspace-a",
      workspaces: [
        {
          ...settings.workspaces?.[0],
          kind: "folder",
          defaultCwd: "/repo/a",
          terminalFontSize: 13,
          profiles: [
            {
              ...settings.workspaces?.[0]?.profiles[0],
              cwd: "/repo/a"
            }
          ],
          layoutPresets: [],
          quickCommands: []
        }
      ]
    });
  });

  it("creates platform shell profiles", () => {
    expect(defaultShellProfile("win32")).toEqual({ name: "PowerShell", command: "powershell.exe", args: ["-NoLogo"] });
    expect(defaultShellProfile("darwin")).toEqual({ name: "zsh", command: "/bin/zsh", args: [] });
    expect(createShellProfile("/repo/a", "CmdOrCtrl+1", "darwin", idFactory(["profile-a"]))).toEqual({
      id: "profile-a",
      name: "zsh",
      cwd: "/repo/a",
      command: "/bin/zsh",
      args: [],
      env: {},
      shortcut: "CmdOrCtrl+1",
      appearance: {
        color: "#9ca3af",
        icon: "terminal"
      }
    });
  });

  it("creates first-launch workspace settings without changing the persisted settings contract", () => {
    const settings: AppSettings = {
      workspace: "/default",
      profiles: [],
      recentWorkspaces: ["/default"]
    };

    expect(
      createInitialWorkspaceSettings(
        settings,
        {
          name: "Pui",
          path: "/repo/pui",
          defaultCwd: "/repo/pui/app",
          terminalFontSize: 15,
          includeCodexProfile: true
        },
        "darwin",
        idFactory(["shell-profile", "codex-profile", "pane-a", "workspace-a"])
      )
    ).toEqual({
      workspace: "/repo/pui",
      profiles: [
        {
          id: "shell-profile",
          name: "zsh",
          cwd: "/repo/pui/app",
          command: "/bin/zsh",
          args: [],
          env: {},
          shortcut: "CmdOrCtrl+1",
          appearance: {
            color: "#9ca3af",
            icon: "terminal"
          }
        },
        {
          id: "codex-profile",
          name: "Codex",
          cwd: "/repo/pui/app",
          command: "codex",
          args: [],
          env: {},
          shortcut: "CmdOrCtrl+2",
          appearance: {
            color: "#9ca3af",
            icon: "sparkles"
          }
        }
      ],
      recentWorkspaces: ["/repo/pui", "/default"],
      activeWorkspaceId: "workspace-a",
      workspaces: [
        {
          id: "workspace-a",
          name: "Pui",
          kind: "folder",
          path: "/repo/pui",
          defaultCwd: "/repo/pui/app",
          terminalFontSize: 15,
          profiles: [
            {
              id: "shell-profile",
              name: "zsh",
              cwd: "/repo/pui/app",
              command: "/bin/zsh",
              args: [],
              env: {},
              shortcut: "CmdOrCtrl+1",
              appearance: {
                color: "#9ca3af",
                icon: "terminal"
              }
            },
            {
              id: "codex-profile",
              name: "Codex",
              cwd: "/repo/pui/app",
              command: "codex",
              args: [],
              env: {},
              shortcut: "CmdOrCtrl+2",
              appearance: {
                color: "#9ca3af",
                icon: "sparkles"
              }
            }
          ],
          layout: {
            activePaneId: "pane-a",
            root: { type: "pane", id: "pane-a", profileId: "shell-profile" }
          },
          layoutPresets: [],
          quickCommands: []
        }
      ],
      layout: undefined
    });
  });

  it("normalizes terminal font size choices", () => {
    expect(normalizeTerminalFontSize(Number.NaN)).toBe(13);
    expect(normalizeTerminalFontSize(8)).toBe(10);
    expect(normalizeTerminalFontSize(25)).toBe(24);
    expect(normalizeTerminalFontSize(13.6)).toBe(14);
  });

  it("extracts a basename from Windows and POSIX paths", () => {
    expect(basename("C:\\Repos\\pui")).toBe("pui");
    expect(basename("/Users/paddy/Documents/GitHub/pui/")).toBe("pui");
    expect(basename("pui")).toBe("pui");
  });
});
