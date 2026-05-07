import {
  DEFAULT_APP_PREFERENCES,
  type AppDensity,
  type AppPreferences,
  type AppSettings,
  type AppThemeToken,
  type AppThemeTokens,
  type ConsoleProfile,
  type GitPanelDefault,
  type TerminalProfileTemplate,
  type TerminalWorkspace,
  type ThemePreset
} from "../../../shared/types";
import { normalizeWorkspaceWorkflow } from "../../../shared/workflow";

export type IdFactory = () => string;

export const createWorkspaceSettingsId: IdFactory = () => crypto.randomUUID();

export type InitialWorkspaceOptions = {
  name: string;
  path: string;
  defaultCwd: string;
  terminalFontSize?: number;
  defaultTerminalProfileId?: string;
  defaultTerminalProfileTemplate?: TerminalProfileTemplate;
  onboardingCompletedVersion?: string;
};

export function normalizeSettings(
  settings: AppSettings,
  platform: string,
  idFactory: IdFactory = createWorkspaceSettingsId
): AppSettings {
  const appPreferences = normalizeAppPreferences(settings.appPreferences, {
    defaultTerminalProfileId: settings.profiles[0]?.id
  });

  if (settings.workspaces) {
    const workspaces = settings.workspaces.map((workspace) =>
      normalizeWorkspaceWorkflow({
        ...workspace,
        kind: workspace.kind ?? ("folder" as const),
        defaultCwd: workspace.defaultCwd || workspace.path,
        terminalFontSize: normalizeTerminalFontSize(workspace.terminalFontSize || appPreferences.terminalFontSize),
        profiles: workspace.profiles.map((profile) => ({
          ...profile,
          cwd: profile.cwd || workspace.defaultCwd || workspace.path
        }))
      })
    );
    const activeWorkspaceId = workspaces.some((workspace) => workspace.id === settings.activeWorkspaceId)
      ? settings.activeWorkspaceId
      : workspaces[0]?.id;
    return { ...settings, appPreferences, activeWorkspaceId, workspaces };
  }

  const path = settings.workspace;
  const profiles =
    settings.profiles.length > 0
      ? settings.profiles
      : [
          createTerminalProfileFromTemplate(
            resolveDefaultTerminalProfileTemplate(appPreferences, settings.profiles, platform),
            path,
            "CmdOrCtrl+1",
            idFactory
          )
        ];
  const paneId = idFactory();
  const workspace: TerminalWorkspace = {
    id: "main-workspace",
    name: basename(path) || "workspace",
    kind: "folder",
    path,
    defaultCwd: path,
    terminalFontSize: appPreferences.terminalFontSize,
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
    appPreferences,
    activeWorkspaceId: workspace.id,
    workspaces: [workspace]
  };
}

export function normalizeAppPreferences(
  preferences?: Partial<AppPreferences>,
  defaults: Partial<AppPreferences> = {}
): AppPreferences {
  const defaultTerminalProfileTemplate = normalizeTerminalProfileTemplate(
    preferences?.defaultTerminalProfileTemplate ?? defaults.defaultTerminalProfileTemplate
  );
  const defaultTerminalProfileId = normalizeOptionalString(
    preferences?.defaultTerminalProfileId ?? defaults.defaultTerminalProfileId
  );
  const onboardingCompletedVersion = normalizeOptionalString(
    preferences?.onboardingCompletedVersion ?? defaults.onboardingCompletedVersion
  );
  return {
    themePreset: normalizeThemePreset(preferences?.themePreset ?? defaults.themePreset),
    density: normalizeAppDensity(preferences?.density ?? defaults.density),
    terminalFontSize: normalizeTerminalFontSize(
      preferences?.terminalFontSize ?? defaults.terminalFontSize ?? DEFAULT_APP_PREFERENCES.terminalFontSize
    ),
    ...normalizeCustomTheme(preferences?.customTheme ?? defaults.customTheme),
    ...(defaultTerminalProfileId ? { defaultTerminalProfileId } : {}),
    ...(defaultTerminalProfileTemplate ? { defaultTerminalProfileTemplate } : {}),
    gitPanelDefault: normalizeGitPanelDefault(preferences?.gitPanelDefault ?? defaults.gitPanelDefault),
    updateChecksEnabled:
      typeof preferences?.updateChecksEnabled === "boolean"
        ? preferences.updateChecksEnabled
        : typeof defaults.updateChecksEnabled === "boolean"
          ? defaults.updateChecksEnabled
          : DEFAULT_APP_PREFERENCES.updateChecksEnabled,
    codeAutocompleteEnabled:
      typeof preferences?.codeAutocompleteEnabled === "boolean"
        ? preferences.codeAutocompleteEnabled
        : typeof defaults.codeAutocompleteEnabled === "boolean"
          ? defaults.codeAutocompleteEnabled
          : DEFAULT_APP_PREFERENCES.codeAutocompleteEnabled,
    ...(onboardingCompletedVersion ? { onboardingCompletedVersion } : {})
  };
}

export function updateAppPreferences(
  settings: AppSettings,
  preferences: Partial<AppPreferences>,
  platform: string
): AppSettings {
  const appPreferences = normalizeAppPreferences(
    { ...settings.appPreferences, ...preferences },
    {
      defaultTerminalProfileId: settings.profiles[0]?.id
    }
  );

  return normalizeSettings({ ...settings, appPreferences }, platform);
}

export function createShellProfile(
  path: string,
  shortcut: string,
  platform: string,
  idFactory: IdFactory = createWorkspaceSettingsId
): ConsoleProfile {
  return createTerminalProfileFromTemplate(defaultShellProfileTemplate(platform), path, shortcut, idFactory);
}

export function defaultShellProfileTemplate(platform: string): TerminalProfileTemplate {
  const shell = defaultShellProfile(platform);
  return {
    name: shell.name,
    command: shell.command,
    args: shell.args,
    env: {},
    appearance: {
      color: "#9ca3af",
      icon: "terminal"
    }
  };
}

export function createTerminalProfileFromTemplate(
  template: TerminalProfileTemplate,
  cwd: string,
  shortcut: string,
  idFactory: IdFactory = createWorkspaceSettingsId
): ConsoleProfile {
  return {
    id: idFactory(),
    name: template.name,
    cwd,
    command: template.command,
    args: [...template.args],
    env: { ...(template.env ?? {}) },
    shortcut,
    appearance: template.appearance ?? {
      color: "#9ca3af",
      icon: "terminal"
    }
  };
}

export function createTerminalProfileTemplateFromProfile(profile: ConsoleProfile): TerminalProfileTemplate {
  return {
    id: profile.id,
    name: profile.name,
    command: profile.command,
    args: [...profile.args],
    env: { ...profile.env },
    appearance: profile.appearance
  };
}

export function resolveDefaultTerminalProfileTemplate(
  preferences: AppPreferences,
  profiles: ConsoleProfile[],
  platform: string
): TerminalProfileTemplate {
  if (preferences.defaultTerminalProfileTemplate) {
    return preferences.defaultTerminalProfileTemplate;
  }

  const profile = preferences.defaultTerminalProfileId
    ? profiles.find((candidate) => candidate.id === preferences.defaultTerminalProfileId)
    : undefined;

  return profile ? createTerminalProfileTemplateFromProfile(profile) : defaultShellProfileTemplate(platform);
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
  const appPreferences = normalizeAppPreferences(
    {
      ...settings.appPreferences,
      terminalFontSize: options.terminalFontSize ?? settings.appPreferences?.terminalFontSize,
      defaultTerminalProfileId: options.defaultTerminalProfileId ?? settings.appPreferences?.defaultTerminalProfileId,
      defaultTerminalProfileTemplate:
        options.defaultTerminalProfileTemplate ?? settings.appPreferences?.defaultTerminalProfileTemplate,
      onboardingCompletedVersion:
        options.onboardingCompletedVersion ?? settings.appPreferences?.onboardingCompletedVersion
    },
    { defaultTerminalProfileId: settings.profiles[0]?.id }
  );
  const shellProfile = createTerminalProfileFromTemplate(
    resolveDefaultTerminalProfileTemplate(appPreferences, settings.profiles, platform),
    defaultCwd,
    "CmdOrCtrl+1",
    idFactory
  );
  const profiles = [shellProfile];
  const paneId = idFactory();
  const workspace: TerminalWorkspace = normalizeWorkspaceWorkflow({
    id: idFactory(),
    name,
    kind: "folder",
    path,
    defaultCwd,
    terminalFontSize: appPreferences.terminalFontSize,
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
    appPreferences,
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

function normalizeThemePreset(value: unknown): ThemePreset {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_APP_PREFERENCES.themePreset;
}

function normalizeAppDensity(value: unknown): AppDensity {
  return value === "compact" || value === "comfortable" ? value : DEFAULT_APP_PREFERENCES.density;
}

function normalizeGitPanelDefault(value: unknown): GitPanelDefault {
  return value === "closed" || value === "open" ? value : DEFAULT_APP_PREFERENCES.gitPanelDefault;
}

const appThemeTokens = new Set<AppThemeToken>([
  "surfaceRoot",
  "surfaceSidebar",
  "surfacePanel",
  "surfaceRaised",
  "surfaceHover",
  "surfaceActive",
  "lineSoft",
  "lineStrong",
  "textStrong",
  "text",
  "textMuted",
  "textFaint",
  "accent",
  "success",
  "warning",
  "danger",
  "terminalBackground",
  "terminalForeground",
  "terminalCursor",
  "terminalSelection"
]);

function normalizeCustomTheme(value: unknown): { customTheme?: AppThemeTokens } {
  if (!isRecord(value)) {
    return {};
  }

  const customTheme: AppThemeTokens = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!appThemeTokens.has(key as AppThemeToken) || typeof rawValue !== "string") {
      continue;
    }
    const tokenValue = rawValue.trim();
    if (tokenValue && tokenValue.length <= 96 && !/[;{}]/.test(tokenValue)) {
      customTheme[key as AppThemeToken] = tokenValue;
    }
  }

  return Object.keys(customTheme).length ? { customTheme } : {};
}

function normalizeTerminalProfileTemplate(value: unknown): TerminalProfileTemplate | undefined {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.command !== "string") {
    return undefined;
  }

  return {
    ...(typeof value.id === "string" && value.id.trim() ? { id: value.id.trim() } : {}),
    name: value.name.trim() || "Shell",
    command: value.command.trim(),
    args: Array.isArray(value.args) ? value.args.filter((item): item is string => typeof item === "string") : [],
    env: normalizeStringRecord(value.env),
    appearance: normalizeProfileAppearance(value.appearance)
  };
}

function normalizeProfileAppearance(value: unknown): ConsoleProfile["appearance"] | undefined {
  if (!isRecord(value) || typeof value.color !== "string" || typeof value.icon !== "string") {
    return undefined;
  }
  return { color: value.color, icon: value.icon };
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
