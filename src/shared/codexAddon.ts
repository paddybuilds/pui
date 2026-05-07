import type { AppSettings, CodexAddonPreferences, CodexWorkspacePreferences, TerminalWorkspace } from "./types";

export const defaultCodexPromptTemplates = [
  {
    id: "explain-workspace",
    name: "Explain workspace",
    prompt: "Inspect this workspace and summarize its architecture, important commands, and likely next steps."
  },
  {
    id: "review-changes",
    name: "Review changes",
    prompt: "Review the current changes for bugs, regressions, missing tests, and maintainability risks."
  },
  {
    id: "fix-tests",
    name: "Fix tests",
    prompt: "Run the relevant tests, diagnose failures, and make the smallest safe fix."
  }
] as const;

export function defaultCodexAddonPreferences(): CodexAddonPreferences {
  return {
    enabled: true,
    defaultModel: "",
    defaultSandbox: "workspace-write",
    interactiveProfileEnabled: true,
    defaultPromptTemplates: defaultCodexPromptTemplates.map((template) => ({ ...template }))
  };
}

export function normalizeCodexAddonPreferences(value: unknown): CodexAddonPreferences {
  const defaults = defaultCodexAddonPreferences();
  const input = isRecord(value) ? value : {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : defaults.enabled,
    defaultModel: typeof input.defaultModel === "string" ? input.defaultModel : defaults.defaultModel,
    defaultSandbox: isSandbox(input.defaultSandbox) ? input.defaultSandbox : defaults.defaultSandbox,
    interactiveProfileEnabled:
      typeof input.interactiveProfileEnabled === "boolean" ? input.interactiveProfileEnabled : defaults.interactiveProfileEnabled,
    defaultPromptTemplates: normalizePromptTemplates(input.defaultPromptTemplates, defaults.defaultPromptTemplates)
  };
}

export function normalizeCodexWorkspacePreferences(value: unknown): CodexWorkspacePreferences | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const next: CodexWorkspacePreferences = {};
  if (typeof value.enabled === "boolean") {
    next.enabled = value.enabled;
  }
  if (typeof value.defaultModel === "string") {
    next.defaultModel = value.defaultModel;
  }
  if (isSandbox(value.defaultSandbox)) {
    next.defaultSandbox = value.defaultSandbox;
  }
  if (typeof value.interactiveProfileEnabled === "boolean") {
    next.interactiveProfileEnabled = value.interactiveProfileEnabled;
  }
  if (Array.isArray(value.defaultPromptTemplates)) {
    next.defaultPromptTemplates = normalizePromptTemplates(value.defaultPromptTemplates, []);
  }
  return Object.keys(next).length ? next : undefined;
}

export function resolveCodexAddonPreferences(
  settings: AppSettings,
  workspace?: TerminalWorkspace
): CodexAddonPreferences {
  const global = normalizeCodexAddonPreferences(settings.appPreferences?.codexAddon);
  return {
    ...global,
    ...(workspace?.codexAddon ?? {}),
    defaultPromptTemplates:
      workspace?.codexAddon?.defaultPromptTemplates && workspace.codexAddon.defaultPromptTemplates.length > 0
        ? workspace.codexAddon.defaultPromptTemplates
        : global.defaultPromptTemplates
  };
}

export function normalizeSettingsCodexPreferences(settings: AppSettings): AppSettings {
  const legacyEnabled = settings.appPreferences?.codexProfileEnabled;
  const global = normalizeCodexAddonPreferences(settings.appPreferences?.codexAddon);
  if (typeof legacyEnabled === "boolean" && !settings.appPreferences?.codexAddon) {
    global.enabled = legacyEnabled;
    global.interactiveProfileEnabled = legacyEnabled;
  }

  return {
    ...settings,
    appPreferences: {
      ...settings.appPreferences,
      codexProfileEnabled: settings.appPreferences?.codexProfileEnabled,
      codexAddon: global
    },
    workspaces: settings.workspaces?.map((workspace) => ({
      ...workspace,
      codexAddon: normalizeCodexWorkspacePreferences(workspace.codexAddon)
    }))
  };
}

function normalizePromptTemplates(value: unknown, fallback: CodexAddonPreferences["defaultPromptTemplates"]) {
  if (!Array.isArray(value)) {
    return fallback.map((template) => ({ ...template }));
  }
  const templates = value
    .filter(isRecord)
    .map((template) => ({
      id: typeof template.id === "string" && template.id.trim() ? template.id : cryptoFallbackId(template.name),
      name: typeof template.name === "string" && template.name.trim() ? template.name.trim() : "Untitled prompt",
      prompt: typeof template.prompt === "string" ? template.prompt : ""
    }))
    .filter((template) => template.prompt.trim());
  return templates.length ? templates : fallback.map((template) => ({ ...template }));
}

function cryptoFallbackId(value: unknown): string {
  const text = typeof value === "string" ? value : "prompt";
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "prompt";
}

function isSandbox(value: unknown): value is CodexAddonPreferences["defaultSandbox"] {
  return value === "read-only" || value === "workspace-write" || value === "danger-full-access";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
