import { describe, expect, it } from "vitest";
import type { AppSettings } from "../../../shared/types";
import { basename, createShellProfile, defaultShellProfile, normalizeSettings } from "./workspaceSettings";

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

  it("extracts a basename from Windows and POSIX paths", () => {
    expect(basename("C:\\Repos\\pui")).toBe("pui");
    expect(basename("/Users/paddy/Documents/GitHub/pui/")).toBe("pui");
    expect(basename("pui")).toBe("pui");
  });
});
