import {
  defaultCodexAddonPreferences,
  normalizeCodexAddonPreferences,
  normalizeSettingsCodexPreferences,
  resolveCodexAddonPreferences
} from "./codexAddon";
import type { AppSettings, TerminalWorkspace } from "./types";

describe("codex addon preferences", () => {
  it("normalizes missing app preferences with compatible defaults", () => {
    const normalized = normalizeSettingsCodexPreferences(baseSettings());
    expect(normalized.appPreferences?.codexAddon).toMatchObject({
      enabled: true,
      defaultModel: "",
      defaultSandbox: "workspace-write",
      interactiveProfileEnabled: true
    });
  });

  it("maps the legacy codex profile toggle into addon defaults", () => {
    const normalized = normalizeSettingsCodexPreferences({
      ...baseSettings(),
      appPreferences: { codexProfileEnabled: false }
    });
    expect(normalized.appPreferences?.codexAddon?.enabled).toBe(false);
    expect(normalized.appPreferences?.codexAddon?.interactiveProfileEnabled).toBe(false);
  });

  it("preserves workspace overrides while inheriting global prompt templates", () => {
    const settings = normalizeSettingsCodexPreferences({
      ...baseSettings(),
      appPreferences: {
        codexAddon: {
          ...defaultCodexAddonPreferences(),
          defaultModel: "gpt-5.4",
          defaultSandbox: "read-only"
        }
      },
      workspaces: [{ ...baseWorkspace(), codexAddon: { defaultSandbox: "danger-full-access" } }]
    });
    const resolved = resolveCodexAddonPreferences(settings, settings.workspaces?.[0]);
    expect(resolved.defaultModel).toBe("gpt-5.4");
    expect(resolved.defaultSandbox).toBe("danger-full-access");
    expect(resolved.defaultPromptTemplates.length).toBeGreaterThan(0);
  });

  it("rejects invalid sandbox values", () => {
    expect(normalizeCodexAddonPreferences({ defaultSandbox: "root" }).defaultSandbox).toBe("workspace-write");
  });
});

function baseSettings(): AppSettings {
  const workspace = baseWorkspace();
  return {
    workspace: workspace.path,
    profiles: workspace.profiles,
    recentWorkspaces: [workspace.path],
    activeWorkspaceId: workspace.id,
    workspaces: [workspace]
  };
}

function baseWorkspace(): TerminalWorkspace {
  return {
    id: "workspace",
    name: "Workspace",
    kind: "folder",
    path: "/repo",
    defaultCwd: "/repo",
    terminalFontSize: 13,
    profiles: [
      {
        id: "shell",
        name: "Shell",
        cwd: "/repo",
        command: "zsh",
        args: [],
        env: {},
        shortcut: "CmdOrCtrl+1",
        appearance: { color: "#9ca3af", icon: "terminal" }
      }
    ],
    layout: {
      activePaneId: "pane",
      root: { type: "pane", id: "pane", profileId: "shell" }
    },
    layoutPresets: [],
    quickCommands: []
  };
}
