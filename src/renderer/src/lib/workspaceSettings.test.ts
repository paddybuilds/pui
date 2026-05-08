import { describe, expect, it } from "vitest";
import { DEFAULT_APP_PREFERENCES, type AppSettings, type AppThemeTokens } from "../../../shared/types";
import {
  basename,
  createInitialWorkspaceSettings,
  createShellProfile,
  createTerminalProfileFromTemplate,
  createTerminalProfileTemplateFromProfile,
  defaultShellProfile,
  defaultShellProfileTemplate,
  normalizeAppPreferences,
  normalizeSettings,
  normalizeTerminalFontSize,
  resolveDefaultTerminalProfileTemplate,
  updateAppPreferences
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
      appPreferences: DEFAULT_APP_PREFERENCES,
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
      appPreferences: DEFAULT_APP_PREFERENCES,
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
    expect(defaultShellProfileTemplate("win32")).toEqual({
      name: "PowerShell",
      command: "powershell.exe",
      args: ["-NoLogo"],
      env: {},
      appearance: {
        color: "#9ca3af",
        icon: "terminal"
      }
    });
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
          terminalFontSize: 15
        },
        "darwin",
        idFactory(["shell-profile", "pane-a", "workspace-a"])
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
        }
      ],
      recentWorkspaces: ["/repo/pui", "/default"],
      appPreferences: {
        ...DEFAULT_APP_PREFERENCES,
        terminalFontSize: 15
      },
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

  it("normalizes missing app preferences to current behavior defaults", () => {
    expect(normalizeAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
    expect(
      normalizeAppPreferences({
        themePreset: "dark",
        density: "compact",
        terminalFontSize: 16,
        customTheme: {
          accent: "#2563eb",
          text: "  #111827  ",
          danger: "red; color: blue",
          unknown: "#ffffff"
        } as AppThemeTokens & Record<string, string>,
        defaultTerminalProfileId: "profile-a",
        gitPanelDefault: "closed",
        updateChecksEnabled: false,
        codeAutocompleteEnabled: false,
        onboardingCompletedVersion: "0.2.0"
      })
    ).toEqual({
      themePreset: "dark",
      density: "compact",
      terminalFontSize: 16,
      customTheme: {
        accent: "#2563eb",
        text: "#111827"
      },
      defaultTerminalProfileId: "profile-a",
      gitPanelDefault: "closed",
      updateChecksEnabled: false,
      codeAutocompleteEnabled: false,
      resumeTerminalSessions: false,
      onboardingCompletedVersion: "0.2.0"
    });
    expect(normalizeAppPreferences({ resumeTerminalSessions: true }).resumeTerminalSessions).toBe(true);
  });

  it("seeds new workspaces from global app preferences and profile templates", () => {
    const settings: AppSettings = {
      workspace: "/default",
      profiles: [],
      recentWorkspaces: ["/default"],
      appPreferences: {
        ...DEFAULT_APP_PREFERENCES,
        terminalFontSize: 16,
        defaultTerminalProfileTemplate: {
          id: "fish-template",
          name: "fish",
          command: "/opt/homebrew/bin/fish",
          args: ["--login"],
          env: { PUI_SHELL: "fish" },
          appearance: { color: "#14b8a6", icon: "terminal" }
        }
      }
    };

    expect(
      createInitialWorkspaceSettings(
        settings,
        {
          name: "Pui",
          path: "/repo/pui",
          defaultCwd: "/repo/pui/app"
        },
        "darwin",
        idFactory(["shell-profile", "pane-a", "workspace-a"])
      )
    ).toMatchObject({
      workspace: "/repo/pui",
      profiles: [
        {
          id: "shell-profile",
          name: "fish",
          cwd: "/repo/pui/app",
          command: "/opt/homebrew/bin/fish",
          args: ["--login"],
          env: { PUI_SHELL: "fish" },
          shortcut: "CmdOrCtrl+1",
          appearance: { color: "#14b8a6", icon: "terminal" }
        }
      ],
      appPreferences: {
        ...settings.appPreferences,
        terminalFontSize: 16
      },
      workspaces: [
        {
          terminalFontSize: 16,
          profiles: [
            {
              name: "fish",
              command: "/opt/homebrew/bin/fish"
            }
          ]
        }
      ]
    });
  });

  it("preserves workspace overrides when app preferences change", () => {
    const settings: AppSettings = {
      workspace: "/repo/a",
      profiles: [],
      recentWorkspaces: ["/repo/a"],
      appPreferences: {
        ...DEFAULT_APP_PREFERENCES,
        terminalFontSize: 16
      },
      activeWorkspaceId: "workspace-a",
      workspaces: [
        {
          id: "workspace-a",
          name: "Repo",
          kind: "folder",
          path: "/repo/a",
          defaultCwd: "/repo/a",
          terminalFontSize: 11,
          profiles: [
            {
              id: "profile-a",
              name: "Custom Shell",
              cwd: "/custom/cwd",
              command: "custom-shell",
              args: ["--flag"],
              env: { KEEP: "true" },
              shortcut: "CmdOrCtrl+8",
              appearance: { color: "#f59e0b", icon: "terminal" }
            }
          ],
          layout: {
            activePaneId: "pane-a",
            root: { type: "pane", id: "pane-a", profileId: "profile-a" }
          }
        }
      ]
    };

    expect(updateAppPreferences(settings, { terminalFontSize: 18 }, "darwin")).toEqual({
      ...settings,
      appPreferences: {
        ...DEFAULT_APP_PREFERENCES,
        terminalFontSize: 18
      },
      workspaces: [
        {
          ...settings.workspaces?.[0],
          layoutPresets: [],
          quickCommands: []
        }
      ]
    });
  });

  it("converts terminal profile templates and existing profiles", () => {
    const profile = createTerminalProfileFromTemplate(
      {
        id: "template-a",
        name: "Custom",
        command: "custom-shell",
        args: ["--login"],
        env: { TERM: "xterm-256color" },
        appearance: { color: "#22c55e", icon: "terminal" }
      },
      "/repo/a",
      "CmdOrCtrl+3",
      idFactory(["profile-a"])
    );

    expect(profile).toEqual({
      id: "profile-a",
      name: "Custom",
      cwd: "/repo/a",
      command: "custom-shell",
      args: ["--login"],
      env: { TERM: "xterm-256color" },
      shortcut: "CmdOrCtrl+3",
      appearance: { color: "#22c55e", icon: "terminal" }
    });
    expect(createTerminalProfileTemplateFromProfile(profile)).toEqual({
      id: "profile-a",
      name: "Custom",
      command: "custom-shell",
      args: ["--login"],
      env: { TERM: "xterm-256color" },
      appearance: { color: "#22c55e", icon: "terminal" }
    });
    expect(
      resolveDefaultTerminalProfileTemplate(
        { ...DEFAULT_APP_PREFERENCES, defaultTerminalProfileId: "profile-a" },
        [profile],
        "darwin"
      )
    ).toEqual(createTerminalProfileTemplateFromProfile(profile));
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
