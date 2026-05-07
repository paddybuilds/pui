import { FormEvent, useEffect, useState } from "react";
import { Code2, Keyboard, Monitor, Settings, TerminalSquare, X } from "lucide-react";
import type { AppSettings, TerminalWorkspace } from "../../../shared/types";

type SettingsSection = "general" | "workspaces" | "terminal" | "codex" | "shortcuts";

type SettingsModalProps = {
  settings: AppSettings;
  activeWorkspace: TerminalWorkspace;
  onWorkspaceChange: (workspace: TerminalWorkspace) => Promise<void>;
  onClose: () => void;
};

const sections: Array<{ id: SettingsSection; label: string; icon: JSX.Element }> = [
  { id: "general", label: "General", icon: <Settings size={15} /> },
  { id: "workspaces", label: "Folders", icon: <Monitor size={15} /> },
  { id: "terminal", label: "Terminal", icon: <TerminalSquare size={15} /> },
  { id: "codex", label: "Codex", icon: <Code2 size={15} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <Keyboard size={15} /> }
];

export function SettingsModal({ settings, activeWorkspace, onWorkspaceChange, onClose }: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>("general");
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
          {section === "codex" ? <CodexSettings activeWorkspace={activeWorkspace} /> : null}
          {section === "shortcuts" ? <ShortcutSettings /> : null}
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

function CodexSettings({ activeWorkspace }: { activeWorkspace: TerminalWorkspace }) {
  return (
    <div className="settings-page">
      <SettingRow label="CLI" value="codex exec --json" />
      <SettingRow label="Folder" value={activeWorkspace.path} />
      <SettingRow label="Run mode" value="Prompt panel" />
    </div>
  );
}

function ShortcutSettings() {
  return (
    <div className="settings-page">
      <SettingRow label="Command palette" value="Cmd K" />
      <SettingRow label="Split right" value="Cmd D" />
      <SettingRow label="Split down" value="Shift Cmd D" />
      <SettingRow label="Codex panel" value="Cmd J" />
    </div>
  );
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
