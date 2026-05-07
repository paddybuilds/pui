import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Keyboard, Monitor, Play, Settings, Sparkles, TerminalSquare, X } from "lucide-react";
import { normalizeCodexAddonPreferences, resolveCodexAddonPreferences } from "../../../shared/codexAddon";
import type { AppSettings, CodexAddonPreferences, QuickCommand, TerminalWorkspace } from "../../../shared/types";
import { shortcutLabel } from "../lib/shortcuts";

type SettingsSection = "general" | "workspaces" | "terminal" | "workflow" | "codex" | "shortcuts";

type SettingsModalProps = {
  settings: AppSettings;
  activeWorkspace: TerminalWorkspace;
  onSettingsChange: (settings: AppSettings) => Promise<void>;
  onWorkspaceChange: (workspace: TerminalWorkspace) => Promise<void>;
  platform: string;
  initialSection?: SettingsSection;
  onClose: () => void;
};

const sections: Array<{ id: SettingsSection; label: string; icon: JSX.Element }> = [
  { id: "general", label: "General", icon: <Settings size={15} /> },
  { id: "workspaces", label: "Folders", icon: <Monitor size={15} /> },
  { id: "terminal", label: "Terminal", icon: <TerminalSquare size={15} /> },
  { id: "workflow", label: "Workflow", icon: <Play size={15} /> },
  { id: "codex", label: "Codex Addon", icon: <Sparkles size={15} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <Keyboard size={15} /> }
];

export function SettingsModal({
  settings,
  activeWorkspace,
  onSettingsChange,
  onWorkspaceChange,
  platform,
  initialSection = "general",
  onClose
}: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const activeSection = sections.find((item) => item.id === section) ?? sections[0];

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(event) => event.stopPropagation()}>
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
          {section === "general" ? <GeneralSettings settings={settings} activeWorkspace={activeWorkspace} /> : null}
          {section === "workspaces" ? (
            <WorkspaceSettings settings={settings} activeWorkspace={activeWorkspace} onWorkspaceChange={onWorkspaceChange} />
          ) : null}
          {section === "terminal" ? (
            <TerminalSettings activeWorkspace={activeWorkspace} onWorkspaceChange={onWorkspaceChange} />
          ) : null}
          {section === "workflow" ? (
            <WorkflowSettings activeWorkspace={activeWorkspace} onWorkspaceChange={onWorkspaceChange} />
          ) : null}
          {section === "codex" ? (
            <CodexSettings
              settings={settings}
              activeWorkspace={activeWorkspace}
              onSettingsChange={onSettingsChange}
              onWorkspaceChange={onWorkspaceChange}
            />
          ) : null}
          {section === "shortcuts" ? <ShortcutSettings platform={platform} /> : null}
        </main>
      </section>
    </div>
  );
}

function GeneralSettings({ settings, activeWorkspace }: { settings: AppSettings; activeWorkspace: TerminalWorkspace }) {
  return (
    <div className="settings-page">
      <SettingRow label="Folder label" value={activeWorkspace.name} />
      <SettingRow label="Open folder" value={basename(activeWorkspace.path)} />
      <SettingRow label="Folder path" value={activeWorkspace.path} />
      <SettingRow label="Recent folders" value={String(settings.recentWorkspaces.length)} />
    </div>
  );
}

function WorkspaceSettings({
  settings,
  activeWorkspace,
  onWorkspaceChange
}: {
  settings: AppSettings;
  activeWorkspace: TerminalWorkspace;
  onWorkspaceChange: (workspace: TerminalWorkspace) => Promise<void>;
}) {
  const [name, setName] = useState(activeWorkspace.name);
  const [path, setPath] = useState(activeWorkspace.path);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    setName(activeWorkspace.name);
    setPath(activeWorkspace.path);
    setStatus("idle");
  }, [activeWorkspace.id, activeWorkspace.name, activeWorkspace.path]);

  const saveWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim() || activeWorkspace.name;
    const nextPath = path.trim() || activeWorkspace.path;
    const previousDefaultCwd = activeWorkspace.defaultCwd || activeWorkspace.path;
    const nextDefaultCwd = activeWorkspace.defaultCwd && activeWorkspace.defaultCwd !== activeWorkspace.path ? activeWorkspace.defaultCwd : nextPath;
    setStatus("saving");
    await onWorkspaceChange({
      ...activeWorkspace,
      name: nextName,
      path: nextPath,
      defaultCwd: nextDefaultCwd,
      profiles: activeWorkspace.profiles.map((profile) =>
        profile.cwd === activeWorkspace.path || profile.cwd === previousDefaultCwd ? { ...profile, cwd: nextDefaultCwd } : profile
      )
    });
    setName(nextName);
    setPath(nextPath);
    setStatus("saved");
    window.setTimeout(() => setStatus("idle"), 1200);
  };

  return (
    <div className="settings-page">
      <form className="settings-form" onSubmit={saveWorkspace}>
        <label htmlFor="workspace-settings-name">Folder label</label>
        <input
          id="workspace-settings-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setStatus("idle");
          }}
        />
        <label htmlFor="workspace-settings-path">Folder path</label>
        <div className="settings-inline-control">
          <input
            id="workspace-settings-path"
            value={path}
            onChange={(event) => {
              setPath(event.target.value);
              setStatus("idle");
            }}
          />
          <button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving" : "Save"}
          </button>
        </div>
        <p>The label is only used in Pui. The open folder title comes from the path.</p>
        {status === "saved" ? <span className="settings-save-state">Saved</span> : null}
      </form>
      <div className="settings-list">
        {(settings.workspaces ?? []).map((workspace) => (
          <div key={workspace.id} className={workspace.id === activeWorkspace.id ? "settings-list-row active" : "settings-list-row"}>
            <span>{workspace.name}</span>
            <code>{workspace.path}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function TerminalSettings({
  activeWorkspace,
  onWorkspaceChange
}: {
  activeWorkspace: TerminalWorkspace;
  onWorkspaceChange: (workspace: TerminalWorkspace) => Promise<void>;
}) {
  const [defaultCwd, setDefaultCwd] = useState(activeWorkspace.defaultCwd || activeWorkspace.path);
  const [fontSize, setFontSize] = useState(String(activeWorkspace.terminalFontSize || 13));
  const [cwdStatus, setCwdStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [fontStatus, setFontStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    setDefaultCwd(activeWorkspace.defaultCwd || activeWorkspace.path);
    setFontSize(String(activeWorkspace.terminalFontSize || 13));
    setCwdStatus("idle");
    setFontStatus("idle");
  }, [activeWorkspace.defaultCwd, activeWorkspace.id, activeWorkspace.path, activeWorkspace.terminalFontSize]);

  const saveDefaultCwd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cwd = defaultCwd.trim() || activeWorkspace.path;
    setCwdStatus("saving");
    await onWorkspaceChange({
      ...activeWorkspace,
      defaultCwd: cwd,
      profiles: activeWorkspace.profiles.map((profile) => ({ ...profile, cwd }))
    });
    setDefaultCwd(cwd);
    setCwdStatus("saved");
    window.setTimeout(() => setCwdStatus("idle"), 1200);
  };

  const saveFontSize = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFontSize = clampTerminalFontSize(Number(fontSize));
    setFontStatus("saving");
    await onWorkspaceChange({
      ...activeWorkspace,
      terminalFontSize: nextFontSize
    });
    setFontSize(String(nextFontSize));
    setFontStatus("saved");
    window.setTimeout(() => setFontStatus("idle"), 1200);
  };

  return (
    <div className="settings-page">
      <form className="settings-form" onSubmit={saveDefaultCwd}>
        <label htmlFor="default-cwd">Default working directory</label>
        <div className="settings-inline-control">
          <input
            id="default-cwd"
            value={defaultCwd}
            onChange={(event) => {
              setDefaultCwd(event.target.value);
              setCwdStatus("idle");
            }}
            placeholder={activeWorkspace.path}
          />
          <button type="submit" disabled={cwdStatus === "saving"}>
            {cwdStatus === "saving" ? "Saving" : "Save"}
          </button>
        </div>
        <p>New terminals in this folder will start here. Existing profile cwd values are updated when you save.</p>
        {cwdStatus === "saved" ? <span className="settings-save-state">Saved</span> : null}
      </form>
      <form className="settings-form" onSubmit={saveFontSize}>
        <label htmlFor="terminal-font-size">Terminal font size</label>
        <div className="settings-inline-control">
          <input
            id="terminal-font-size"
            type="number"
            min={10}
            max={24}
            step={1}
            value={fontSize}
            onChange={(event) => {
              setFontSize(event.target.value);
              setFontStatus("idle");
            }}
          />
          <button type="submit" disabled={fontStatus === "saving"}>
            {fontStatus === "saving" ? "Saving" : "Save"}
          </button>
        </div>
        <p>Applies to terminals in this folder.</p>
        {fontStatus === "saved" ? <span className="settings-save-state">Saved</span> : null}
      </form>
      <SettingRow label="Shell marker" value="Hidden" />
      <SettingRow label="Cursor" value="Focused pane only" />
      <SettingRow label="Font" value={`Geist Mono, ${activeWorkspace.terminalFontSize || 13}px`} />
      <SettingRow label="Splits" value="Warp-style shortcuts" />
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
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    setStatus("idle");
  }, [activeWorkspace.id]);

  const saveQuickCommand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      return;
    }
    const quickCommand: QuickCommand = {
      id: crypto.randomUUID(),
      name: name.trim() || trimmedCommand,
      command: trimmedCommand,
      args: splitArgs(args),
      cwd: cwd.trim() || undefined,
      env: {},
      shortcut: "",
      splitDirection
    };
    setStatus("saving");
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

  const deleteQuickCommand = async (id: string) => {
    await onWorkspaceChange({
      ...activeWorkspace,
      quickCommands: (activeWorkspace.quickCommands ?? []).filter((item) => item.id !== id)
    });
  };

  const renamePreset = async (id: string) => {
    const preset = activeWorkspace.layoutPresets?.find((item) => item.id === id);
    const nextName = window.prompt("Preset name", preset?.name)?.trim();
    if (!preset || !nextName) {
      return;
    }
    await onWorkspaceChange({
      ...activeWorkspace,
      layoutPresets: (activeWorkspace.layoutPresets ?? []).map((item) =>
        item.id === id ? { ...item, name: nextName, updatedAt: new Date().toISOString() } : item
      )
    });
  };

  const deletePreset = async (id: string) => {
    await onWorkspaceChange({
      ...activeWorkspace,
      layoutPresets: (activeWorkspace.layoutPresets ?? []).filter((item) => item.id !== id)
    });
  };

  return (
    <div className="settings-page">
      <form className="settings-form" onSubmit={saveQuickCommand}>
        <label htmlFor="quick-command-name">Quick command</label>
        <div className="settings-inline-control">
          <input id="quick-command-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" />
          <select value={splitDirection} onChange={(event) => setSplitDirection(event.target.value as "right" | "down")}>
            <option value="down">Split down</option>
            <option value="right">Split right</option>
          </select>
        </div>
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Command, e.g. npm" />
        <input value={args} onChange={(event) => setArgs(event.target.value)} placeholder="Args, e.g. run test" />
        <div className="settings-inline-control">
          <input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder={activeWorkspace.defaultCwd || activeWorkspace.path} />
          <button type="submit" disabled={status === "saving" || !command.trim()}>
            {status === "saving" ? "Saving" : "Add"}
          </button>
        </div>
        <p>Commands run in a new split terminal. Empty cwd uses the folder default.</p>
        {status === "saved" ? <span className="settings-save-state">Saved</span> : null}
      </form>

      <SettingGroup title="Quick commands">
        {(activeWorkspace.quickCommands ?? []).map((item) => (
          <div key={item.id} className="settings-list-row">
            <span>{item.name}</span>
            <code>{[item.command, ...item.args].join(" ")}</code>
            <button type="button" onClick={() => void deleteQuickCommand(item.id)}>Delete</button>
          </div>
        ))}
        {(activeWorkspace.quickCommands ?? []).length === 0 ? <p>No quick commands yet.</p> : null}
      </SettingGroup>

      <SettingGroup title="Layout presets">
        {(activeWorkspace.layoutPresets ?? []).map((preset) => (
          <div key={preset.id} className="settings-list-row">
            <span>{preset.name}</span>
            <code>{new Date(preset.updatedAt).toLocaleDateString()}</code>
            <button type="button" onClick={() => void renamePreset(preset.id)}>Rename</button>
            <button type="button" onClick={() => void deletePreset(preset.id)}>Delete</button>
          </div>
        ))}
        {(activeWorkspace.layoutPresets ?? []).length === 0 ? <p>No saved layouts yet.</p> : null}
      </SettingGroup>
    </div>
  );
}

function CodexSettings({
  settings,
  activeWorkspace,
  onSettingsChange,
  onWorkspaceChange
}: {
  settings: AppSettings;
  activeWorkspace: TerminalWorkspace;
  onSettingsChange: (settings: AppSettings) => Promise<void>;
  onWorkspaceChange: (workspace: TerminalWorkspace) => Promise<void>;
}) {
  const globalPreferences = normalizeCodexAddonPreferences(settings.appPreferences?.codexAddon);
  const workspacePreferences = resolveCodexAddonPreferences(settings, activeWorkspace);
  const codexProfile = activeWorkspace.profiles.find((profile) => profile.command.toLowerCase() === "codex");

  const updateGlobal = async (next: Partial<CodexAddonPreferences>) => {
    await onSettingsChange({
      ...settings,
      appPreferences: {
        ...settings.appPreferences,
        codexProfileEnabled: next.interactiveProfileEnabled ?? settings.appPreferences?.codexProfileEnabled,
        codexAddon: {
          ...globalPreferences,
          ...next
        }
      }
    });
  };

  const updateWorkspace = async (next: Partial<CodexAddonPreferences>) => {
    await onWorkspaceChange({
      ...activeWorkspace,
      codexAddon: {
        ...(activeWorkspace.codexAddon ?? {}),
        ...next
      }
    });
  };

  return (
    <div className="settings-page">
      <SettingGroup title="Global defaults">
        <label className="settings-toggle-row">
          <span>Enable Codex Addon for new folders</span>
          <input type="checkbox" checked={globalPreferences.enabled} onChange={(event) => void updateGlobal({ enabled: event.target.checked })} />
        </label>
        <label className="settings-toggle-row">
          <span>Add interactive Codex terminal profile</span>
          <input
            type="checkbox"
            checked={globalPreferences.interactiveProfileEnabled}
            onChange={(event) => void updateGlobal({ interactiveProfileEnabled: event.target.checked })}
          />
        </label>
        <div className="settings-inline-control">
          <input
            value={globalPreferences.defaultModel}
            onChange={(event) => void updateGlobal({ defaultModel: event.target.value })}
            placeholder="Default model, or leave blank for CLI default"
          />
          <select
            value={globalPreferences.defaultSandbox}
            onChange={(event) => void updateGlobal({ defaultSandbox: event.target.value as CodexAddonPreferences["defaultSandbox"] })}
          >
            <option value="read-only">Read only</option>
            <option value="workspace-write">Workspace write</option>
            <option value="danger-full-access">Danger full access</option>
          </select>
        </div>
      </SettingGroup>

      <SettingGroup title="Current workspace">
        <label className="settings-toggle-row">
          <span>Enabled in {activeWorkspace.name}</span>
          <input
            type="checkbox"
            checked={workspacePreferences.enabled}
            onChange={(event) => void updateWorkspace({ enabled: event.target.checked })}
          />
        </label>
        <div className="settings-inline-control">
          <input
            value={workspacePreferences.defaultModel}
            onChange={(event) => void updateWorkspace({ defaultModel: event.target.value })}
            placeholder="Inherit model"
          />
          <select
            value={workspacePreferences.defaultSandbox}
            onChange={(event) => void updateWorkspace({ defaultSandbox: event.target.value as CodexAddonPreferences["defaultSandbox"] })}
          >
            <option value="read-only">Read only</option>
            <option value="workspace-write">Workspace write</option>
            <option value="danger-full-access">Danger full access</option>
          </select>
        </div>
        <SettingRow label="Interactive profile" value={codexProfile ? "Present" : "Not added yet"} />
        <SettingRow label="Prompt templates" value={String(workspacePreferences.defaultPromptTemplates.length)} />
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

function splitArgs(value: string): string[] {
  return value.split(" ").map((item) => item.trim()).filter(Boolean);
}

function clampTerminalFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 13;
  }
  return Math.min(24, Math.max(10, Math.round(value)));
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
