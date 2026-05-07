import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import {
  GitBranch,
  Info,
  Keyboard,
  Monitor,
  Paintbrush,
  Play,
  RefreshCw,
  RotateCcw,
  TerminalSquare,
  X
} from "lucide-react";
import type { ShellCandidate } from "../../../preload";
import type {
  AppDensity,
  AppPreferences,
  AppSettings,
  AppThemeToken,
  AppThemeTokens,
  AppUpdateSnapshot,
  AppVersionInfo,
  ConsoleProfile,
  GitPanelDefault,
  QuickCommand,
  TerminalWorkspace,
  ThemePreset
} from "../../../shared/types";
import { getPuiApi } from "../lib/browserApi";
import { shortcutLabel } from "../lib/shortcuts";
import { compactThemeTokens, isPlainColorValue, resolveThemeTokens, THEME_TOKEN_FIELDS } from "../lib/theme";
import {
  createTerminalProfileTemplateFromProfile,
  normalizeAppPreferences,
  normalizeTerminalFontSize,
  updateAppPreferences
} from "../lib/workspaceSettings";

const pui = getPuiApi();

type SettingsSection = "about" | "appearance" | "profiles" | "defaults" | "git" | "updates" | "workflow" | "shortcuts";

type SettingsModalProps = {
  settings: AppSettings;
  activeWorkspace: TerminalWorkspace;
  onSettingsChange: (settings: AppSettings) => Promise<void>;
  onWorkspaceChange: (workspace: TerminalWorkspace) => Promise<void>;
  onReplayOnboarding: () => void;
  platform: string;
  onClose: () => void;
};

const sections: Array<{ id: SettingsSection; label: string; icon: JSX.Element }> = [
  { id: "about", label: "About", icon: <Info size={15} /> },
  { id: "appearance", label: "Appearance", icon: <Paintbrush size={15} /> },
  { id: "profiles", label: "Terminal profiles", icon: <TerminalSquare size={15} /> },
  { id: "defaults", label: "Workspace defaults", icon: <Monitor size={15} /> },
  { id: "git", label: "Git", icon: <GitBranch size={15} /> },
  { id: "updates", label: "Updates", icon: <RefreshCw size={15} /> },
  { id: "workflow", label: "Workflow", icon: <Play size={15} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <Keyboard size={15} /> }
];

export function SettingsModal({
  settings,
  activeWorkspace,
  onSettingsChange,
  onWorkspaceChange,
  onReplayOnboarding,
  platform,
  onClose
}: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>("about");
  const activeSection = sections.find((item) => item.id === section) ?? sections[0];
  const preferences = normalizeAppPreferences(settings.appPreferences, {
    defaultTerminalProfileId: settings.profiles[0]?.id
  });

  const savePreferences = async (next: Partial<AppPreferences>) => {
    await onSettingsChange(updateAppPreferences(settings, next, platform));
  };

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="settings-sidebar">
          <header>
            <strong>Settings</strong>
            <button className="icon-button" type="button" title="Close settings" onClick={onClose}>
              <X size={15} />
            </button>
          </header>
          <nav>
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === section ? "settings-tab active" : "settings-tab"}
                onClick={() => setSection(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="settings-content">
          <header className="settings-content-header">
            <h2>{activeSection.label}</h2>
          </header>
          {section === "about" ? <AboutSettings onReplayOnboarding={onReplayOnboarding} /> : null}
          {section === "appearance" ? <AppearanceSettings preferences={preferences} onSave={savePreferences} /> : null}
          {section === "profiles" ? (
            <TerminalProfilesSettings
              settings={settings}
              activeWorkspace={activeWorkspace}
              preferences={preferences}
              onSettingsChange={onSettingsChange}
              onWorkspaceChange={onWorkspaceChange}
              platform={platform}
            />
          ) : null}
          {section === "defaults" ? (
            <WorkspaceDefaultsSettings activeWorkspace={activeWorkspace} onWorkspaceChange={onWorkspaceChange} />
          ) : null}
          {section === "git" ? <GitSettings preferences={preferences} onSave={savePreferences} /> : null}
          {section === "updates" ? <UpdateSettings preferences={preferences} onSave={savePreferences} /> : null}
          {section === "workflow" ? (
            <WorkflowSettings activeWorkspace={activeWorkspace} onWorkspaceChange={onWorkspaceChange} />
          ) : null}
          {section === "shortcuts" ? <ShortcutSettings platform={platform} /> : null}
        </main>
      </section>
    </div>
  );
}

function AboutSettings({ onReplayOnboarding }: { onReplayOnboarding: () => void }) {
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo>();
  const [versionError, setVersionError] = useState<string>();
  const [updateStatus, setUpdateStatus] = useState<AppUpdateSnapshot>();

  useEffect(() => {
    let mounted = true;
    void pui.app
      .getVersionInfo()
      .then((info) => {
        if (mounted) {
          setVersionInfo(info);
          setVersionError(undefined);
        }
      })
      .catch((error: unknown) => mounted && setVersionError(error instanceof Error ? error.message : String(error)));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return pui.app.onUpdateStatus((status) => setUpdateStatus(status));
  }, []);

  const checkForUpdates = async () => {
    try {
      setUpdateStatus(await pui.app.checkForUpdates());
      setVersionError(undefined);
    } catch (error) {
      setUpdateStatus({
        status: "error",
        currentVersion: versionInfo?.version ?? "unknown",
        message: error instanceof Error ? error.message : String(error),
        installReady: false,
        installSupported: false
      });
    }
  };

  const downloadUpdate = async () => {
    setUpdateStatus(await pui.app.downloadUpdate());
  };

  const installDownloadedUpdate = async () => {
    setUpdateStatus(await pui.app.installDownloadedUpdate());
  };

  const checking = updateStatus?.status === "checking";
  const downloading = updateStatus?.status === "downloading";
  const canDownload = updateStatus?.status === "available" && updateStatus.installSupported;
  const canInstall = updateStatus?.status === "downloaded" && updateStatus.installReady;

  return (
    <div className="settings-page">
      <SettingGroup title="Pui build">
        <SettingRow label="Version" value={versionInfo?.version ?? (versionError ? "Unavailable" : "Loading")} />
        <SettingRow label="Commit" value={versionInfo?.commitShortSha ?? "Unavailable"} />
        <SettingRow label="Repository" value={versionInfo?.repositoryUrl ?? "Unavailable"} />
      </SettingGroup>
      <SettingGroup title="Updates">
        <div className="settings-action-row">
          <button
            type="button"
            onClick={() => void checkForUpdates()}
            disabled={!versionInfo || checking || downloading}
          >
            <RefreshCw size={14} className={checking ? "settings-spin" : undefined} />
            <span>{checking ? "Checking" : "Check for updates"}</span>
          </button>
          {canDownload ? (
            <button type="button" onClick={() => void downloadUpdate()}>
              <RefreshCw size={14} />
              <span>Download update</span>
            </button>
          ) : null}
          {canInstall ? (
            <button type="button" onClick={() => void installDownloadedUpdate()}>
              <RefreshCw size={14} />
              <span>Install and restart</span>
            </button>
          ) : null}
          {updateStatus?.releaseUrl ? (
            <button type="button" onClick={() => window.open(updateStatus.releaseUrl, "_blank", "noopener")}>
              <span>Open release</span>
            </button>
          ) : null}
          <span
            className={`settings-update-status ${updateStatus ? updateCheckTone(updateStatus) : versionError ? "error" : ""}`}
            role="status"
          >
            {updateStatus?.message || versionError || ""}
          </span>
        </div>
        {updateStatus?.progress ? (
          <progress
            className="settings-update-progress"
            value={Math.round(updateStatus.progress.percent)}
            max={100}
            aria-label="Update download progress"
          />
        ) : null}
      </SettingGroup>
      <SettingGroup title="Onboarding">
        <div className="settings-action-row">
          <button type="button" onClick={onReplayOnboarding}>
            <RotateCcw size={14} />
            <span>Replay onboarding</span>
          </button>
          <span className="settings-update-status">Review workspace, terminal, appearance, and workflow defaults.</span>
        </div>
      </SettingGroup>
    </div>
  );
}

function AppearanceSettings({
  preferences,
  onSave
}: {
  preferences: AppPreferences;
  onSave: (next: Partial<AppPreferences>) => Promise<void>;
}) {
  const [themePreset, setThemePreset] = useState<ThemePreset>(preferences.themePreset);
  const [density, setDensity] = useState<AppDensity>(preferences.density);
  const [customTheme, setCustomTheme] = useState<AppThemeTokens>(preferences.customTheme ?? {});
  const [status, setStatus] = useState("idle");
  const resolvedTokens = resolveThemeTokens({ themePreset, customTheme });

  useEffect(() => {
    setThemePreset(preferences.themePreset);
    setDensity(preferences.density);
    setCustomTheme(preferences.customTheme ?? {});
  }, [preferences.customTheme, preferences.density, preferences.themePreset]);

  const setToken = (token: AppThemeToken, value: string) => {
    setCustomTheme((current) => ({ ...current, [token]: value }));
  };

  const resetToken = (token: AppThemeToken) => {
    setCustomTheme((current) => {
      const next = { ...current };
      delete next[token];
      return next;
    });
  };

  return (
    <div className="settings-page">
      <form
        className="settings-form"
        onSubmit={(event) =>
          void saveForm(event, setStatus, () =>
            onSave({ themePreset, density, customTheme: compactThemeTokens(customTheme) })
          )
        }
      >
        <strong>Base appearance</strong>
        <label htmlFor="theme-preset">Theme</label>
        <select
          id="theme-preset"
          value={themePreset}
          onChange={(event) => setThemePreset(event.target.value as ThemePreset)}
        >
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
        <label htmlFor="density">Density</label>
        <select id="density" value={density} onChange={(event) => setDensity(event.target.value as AppDensity)}>
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
        <div className="theme-preview" aria-label="Theme preview">
          <div style={{ background: resolvedTokens.surfaceSidebar }} />
          <div style={{ background: resolvedTokens.surfacePanel }} />
          <div style={{ background: resolvedTokens.accent }} />
          <div style={{ background: resolvedTokens.terminalBackground }} />
        </div>
        <strong>Theme tokens</strong>
        <p>Override any token with a hex, rgb, hsl, or rgba value. Empty values inherit from the selected theme.</p>
        <div className="theme-token-grid">
          {THEME_TOKEN_FIELDS.map((field) => {
            const value = customTheme[field.token] ?? "";
            const previewValue = value || resolvedTokens[field.token];
            return (
              <label key={field.token} className="theme-token-row" htmlFor={`theme-token-${field.token}`}>
                <span>{field.label}</span>
                <span className="theme-token-control">
                  <span className="theme-token-swatch" style={{ background: previewValue }} aria-hidden="true" />
                  <input
                    id={`theme-token-${field.token}`}
                    value={value}
                    onChange={(event) => setToken(field.token, event.target.value)}
                    placeholder={resolvedTokens[field.token]}
                  />
                  {isPlainColorValue(previewValue) ? (
                    <input
                      type="color"
                      value={previewValue}
                      aria-label={`${field.label} color`}
                      onChange={(event) => setToken(field.token, event.target.value)}
                    />
                  ) : null}
                  <button type="button" title={`Reset ${field.label}`} onClick={() => resetToken(field.token)}>
                    Reset
                  </button>
                </span>
              </label>
            );
          })}
        </div>
        <SaveButton status={status} />
      </form>
    </div>
  );
}

function TerminalProfilesSettings({
  settings,
  activeWorkspace,
  preferences,
  onSettingsChange,
  onWorkspaceChange,
  platform
}: {
  settings: AppSettings;
  activeWorkspace: TerminalWorkspace;
  preferences: AppPreferences;
  onSettingsChange: (settings: AppSettings) => Promise<void>;
  onWorkspaceChange: (workspace: TerminalWorkspace) => Promise<void>;
  platform: string;
}) {
  const [shells, setShells] = useState<ShellCandidate[]>([]);
  const [editing, setEditing] = useState(() =>
    profileDraft(activeWorkspace.profiles[0], activeWorkspace.defaultCwd || activeWorkspace.path)
  );
  const [status, setStatus] = useState("idle");
  const defaultProfileId = preferences.defaultTerminalProfileId || activeWorkspace.profiles[0]?.id;

  useEffect(() => {
    void pui.system
      .listShells()
      .then((items) => setShells(items.filter((item) => item.available || item.source === "custom")));
  }, []);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing.name.trim() || !editing.command.trim()) {
      return;
    }
    setStatus("saving");
    const profile: ConsoleProfile = {
      id: editing.id || crypto.randomUUID(),
      name: editing.name.trim(),
      cwd: editing.cwd.trim() || activeWorkspace.defaultCwd || activeWorkspace.path,
      command: editing.command.trim(),
      args: splitArgs(editing.args),
      env: parseEnvLines(editing.env),
      shortcut: editing.shortcut.trim(),
      appearance: { color: editing.color.trim() || "#9ca3af", icon: editing.icon.trim() || "terminal" }
    };
    const nextWorkspace = {
      ...activeWorkspace,
      profiles: [...activeWorkspace.profiles.filter((item) => item.id !== profile.id), profile]
    };
    await onSettingsChange(
      updateAppPreferences(
        {
          ...settings,
          workspaces: (settings.workspaces ?? []).map((workspace) =>
            workspace.id === nextWorkspace.id ? nextWorkspace : workspace
          )
        },
        {
          defaultTerminalProfileId: preferences.defaultTerminalProfileId || profile.id,
          defaultTerminalProfileTemplate: createTerminalProfileTemplateFromProfile(profile)
        },
        platform
      )
    );
    setEditing(profileDraft(profile, profile.cwd));
    setStatus("saved");
    window.setTimeout(() => setStatus("idle"), 1200);
  };

  const deleteProfile = async (id: string) => {
    if (activeWorkspace.profiles.length <= 1) {
      return;
    }
    const nextProfiles = activeWorkspace.profiles.filter((profile) => profile.id !== id);
    await onWorkspaceChange({ ...activeWorkspace, profiles: nextProfiles });
  };

  return (
    <div className="settings-page">
      <SettingGroup title="Detected terminals">
        <div className="settings-list">
          {shells.map((shell) => (
            <button
              key={shell.id}
              className="settings-list-row settings-select-row"
              type="button"
              onClick={() => setEditing(shellDraft(shell, activeWorkspace.defaultCwd || activeWorkspace.path))}
            >
              <span>{shell.name}</span>
              <code>{[shell.command, ...shell.args].join(" ") || "Custom command"}</code>
            </button>
          ))}
        </div>
      </SettingGroup>
      <form className="settings-form" onSubmit={saveProfile}>
        <strong>{editing.id ? "Edit profile" : "New profile"}</strong>
        <input
          value={editing.name}
          onChange={(event) => setEditing({ ...editing, name: event.target.value })}
          placeholder="Name"
        />
        <input
          value={editing.command}
          onChange={(event) => setEditing({ ...editing, command: event.target.value })}
          placeholder="Command"
        />
        <input
          value={editing.args}
          onChange={(event) => setEditing({ ...editing, args: event.target.value })}
          placeholder="Args"
        />
        <input
          value={editing.cwd}
          onChange={(event) => setEditing({ ...editing, cwd: event.target.value })}
          placeholder="Working directory"
        />
        <textarea
          value={editing.env}
          onChange={(event) => setEditing({ ...editing, env: event.target.value })}
          placeholder={"ENV=value\nNEXT=value"}
        />
        <div className="settings-inline-control">
          <input
            value={editing.shortcut}
            onChange={(event) => setEditing({ ...editing, shortcut: event.target.value })}
            placeholder="Shortcut"
          />
          <input
            value={editing.icon}
            onChange={(event) => setEditing({ ...editing, icon: event.target.value })}
            placeholder="Icon"
          />
          <input
            value={editing.color}
            onChange={(event) => setEditing({ ...editing, color: event.target.value })}
            placeholder="#9ca3af"
          />
        </div>
        <SaveButton status={status} label={editing.id ? "Save profile" : "Add profile"} />
      </form>
      <SettingGroup title="Workspace profiles">
        {activeWorkspace.profiles.map((profile) => (
          <div key={profile.id} className="settings-list-row">
            <span>{profile.name}</span>
            <code>{profile.id === defaultProfileId ? "Default" : [profile.command, ...profile.args].join(" ")}</code>
            <button
              type="button"
              onClick={() =>
                void onSettingsChange(
                  updateAppPreferences(
                    settings,
                    {
                      defaultTerminalProfileId: profile.id,
                      defaultTerminalProfileTemplate: createTerminalProfileTemplateFromProfile(profile)
                    },
                    platform
                  )
                )
              }
            >
              Default
            </button>
            <button type="button" onClick={() => setEditing(profileDraft(profile, profile.cwd))}>
              Edit
            </button>
            <button
              type="button"
              onClick={() => void deleteProfile(profile.id)}
              disabled={activeWorkspace.profiles.length <= 1}
            >
              Delete
            </button>
          </div>
        ))}
      </SettingGroup>
    </div>
  );
}

function WorkspaceDefaultsSettings({
  activeWorkspace,
  onWorkspaceChange
}: {
  activeWorkspace: TerminalWorkspace;
  onWorkspaceChange: (workspace: TerminalWorkspace) => Promise<void>;
}) {
  const [defaultCwd, setDefaultCwd] = useState(activeWorkspace.defaultCwd || activeWorkspace.path);
  const [fontSize, setFontSize] = useState(String(activeWorkspace.terminalFontSize || 13));
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    setDefaultCwd(activeWorkspace.defaultCwd || activeWorkspace.path);
    setFontSize(String(activeWorkspace.terminalFontSize || 13));
  }, [activeWorkspace.defaultCwd, activeWorkspace.id, activeWorkspace.path, activeWorkspace.terminalFontSize]);

  return (
    <div className="settings-page">
      <form
        className="settings-form"
        onSubmit={(event) =>
          void saveForm(event, setStatus, () =>
            onWorkspaceChange({
              ...activeWorkspace,
              defaultCwd: defaultCwd.trim() || activeWorkspace.path,
              terminalFontSize: normalizeTerminalFontSize(Number(fontSize))
            })
          )
        }
      >
        <label htmlFor="default-cwd">Default working directory</label>
        <input id="default-cwd" value={defaultCwd} onChange={(event) => setDefaultCwd(event.target.value)} />
        <label htmlFor="workspace-font-size">Terminal font size</label>
        <input
          id="workspace-font-size"
          type="number"
          min={10}
          max={24}
          step={1}
          value={fontSize}
          onChange={(event) => setFontSize(event.target.value)}
        />
        <SaveButton status={status} />
      </form>
    </div>
  );
}

function GitSettings({
  preferences,
  onSave
}: {
  preferences: AppPreferences;
  onSave: (next: Partial<AppPreferences>) => Promise<void>;
}) {
  return (
    <div className="settings-page">
      <SettingGroup title="Git panel">
        <label className="settings-check-row">
          <input
            type="checkbox"
            checked={preferences.gitPanelDefault === "open"}
            onChange={(event) =>
              void onSave({ gitPanelDefault: event.target.checked ? "open" : ("closed" as GitPanelDefault) })
            }
          />
          <span>Open Git panel by default for repositories</span>
        </label>
      </SettingGroup>
    </div>
  );
}

function UpdateSettings({
  preferences,
  onSave
}: {
  preferences: AppPreferences;
  onSave: (next: Partial<AppPreferences>) => Promise<void>;
}) {
  return (
    <div className="settings-page">
      <SettingGroup title="Update checks">
        <label className="settings-check-row">
          <input
            type="checkbox"
            checked={preferences.updateChecksEnabled}
            onChange={(event) => void onSave({ updateChecksEnabled: event.target.checked })}
          />
          <span>Enable update checks</span>
        </label>
      </SettingGroup>
    </div>
  );
}

function WorkflowSettings({
  activeWorkspace,
  onWorkspaceChange
}: {
  activeWorkspace: TerminalWorkspace;
  onWorkspaceChange: (workspace: TerminalWorkspace) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [cwd, setCwd] = useState("");
  const [splitDirection, setSplitDirection] = useState<"right" | "down">("down");
  const [status, setStatus] = useState("idle");

  const saveQuickCommand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!command.trim()) {
      return;
    }
    setStatus("saving");
    const quickCommand: QuickCommand = {
      id: crypto.randomUUID(),
      name: name.trim() || command.trim(),
      command: command.trim(),
      args: splitArgs(args),
      cwd: cwd.trim() || undefined,
      env: {},
      shortcut: "",
      splitDirection
    };
    await onWorkspaceChange({
      ...activeWorkspace,
      quickCommands: [...(activeWorkspace.quickCommands ?? []), quickCommand]
    });
    setName("");
    setCommand("");
    setArgs("");
    setCwd("");
    setStatus("saved");
    window.setTimeout(() => setStatus("idle"), 1200);
  };

  return (
    <div className="settings-page">
      <form className="settings-form" onSubmit={saveQuickCommand}>
        <label htmlFor="quick-command-name">Quick command</label>
        <div className="settings-inline-control">
          <input
            id="quick-command-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
          />
          <select
            value={splitDirection}
            onChange={(event) => setSplitDirection(event.target.value as "right" | "down")}
          >
            <option value="down">Split down</option>
            <option value="right">Split right</option>
          </select>
        </div>
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Command, e.g. npm" />
        <input value={args} onChange={(event) => setArgs(event.target.value)} placeholder="Args, e.g. run test" />
        <input
          value={cwd}
          onChange={(event) => setCwd(event.target.value)}
          placeholder={activeWorkspace.defaultCwd || activeWorkspace.path}
        />
        <SaveButton status={status} label="Add" />
      </form>
      <SettingGroup title="Quick commands">
        {(activeWorkspace.quickCommands ?? []).map((item) => (
          <div key={item.id} className="settings-list-row">
            <span>{item.name}</span>
            <code>{[item.command, ...item.args].join(" ")}</code>
            <button
              type="button"
              onClick={() =>
                void onWorkspaceChange({
                  ...activeWorkspace,
                  quickCommands: (activeWorkspace.quickCommands ?? []).filter(
                    (commandItem) => commandItem.id !== item.id
                  )
                })
              }
            >
              Delete
            </button>
          </div>
        ))}
        {(activeWorkspace.quickCommands ?? []).length === 0 ? <p>No quick commands yet.</p> : null}
      </SettingGroup>
    </div>
  );
}

function ShortcutSettings({ platform }: { platform: string }) {
  return (
    <div className="settings-page">
      <SettingRow label="Command palette" value={shortcutLabel("CmdOrCtrl+K", platform)} />
      <SettingRow label="Split right" value={shortcutLabel("CmdOrCtrl+D", platform)} />
      <SettingRow label="Split down" value={shortcutLabel("CmdOrCtrl+Shift+D", platform)} />
      <SettingRow label="Close pane" value={shortcutLabel("CmdOrCtrl+W", platform)} />
    </div>
  );
}

function SettingGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-form">
      <strong>{title}</strong>
      <div className="settings-list">{children}</div>
    </section>
  );
}

function SaveButton({ status, label = "Save" }: { status: string; label?: string }) {
  return (
    <button type="submit" disabled={status === "saving"}>
      {status === "saving" ? "Saving" : label}
    </button>
  );
}

async function saveForm(
  event: FormEvent<HTMLFormElement>,
  setStatus: (status: string) => void,
  save: () => Promise<void>
) {
  event.preventDefault();
  setStatus("saving");
  await save();
  setStatus("saved");
  window.setTimeout(() => setStatus("idle"), 1200);
}

function profileDraft(profile: ConsoleProfile | undefined, cwd: string) {
  return {
    id: profile?.id ?? "",
    name: profile?.name ?? "",
    command: profile?.command ?? "",
    args: profile?.args.join(" ") ?? "",
    cwd: profile?.cwd ?? cwd,
    env: Object.entries(profile?.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
    shortcut: profile?.shortcut ?? "",
    icon: profile?.appearance.icon ?? "terminal",
    color: profile?.appearance.color ?? "#9ca3af"
  };
}

function shellDraft(shell: ShellCandidate, cwd: string) {
  return {
    id: "",
    name: shell.source === "custom" ? "" : shell.name,
    command: shell.command,
    args: shell.args.join(" "),
    cwd,
    env: "",
    shortcut: "",
    icon: "terminal",
    color: "#9ca3af"
  };
}

function parseEnvLines(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key.trim(), rest.join("=").trim()];
      })
      .filter(([key]) => key)
  );
}

function splitArgs(value: string): string[] {
  return value
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
}

function updateCheckTone(result: AppUpdateSnapshot): "success" | "notice" | "error" {
  if (result.status === "error") {
    return "error";
  }
  if (result.status === "available" || result.status === "downloaded") {
    return "success";
  }
  if (result.status === "not-available") {
    return "notice";
  }
  return "notice";
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}
