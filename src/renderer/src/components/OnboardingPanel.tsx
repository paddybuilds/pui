import { type FormEvent, useEffect, useMemo, useState } from "react";
import { FolderOpen, Play, TerminalSquare } from "lucide-react";
import type { AppSettings } from "../../../shared/types";
import {
  basename,
  createInitialWorkspaceSettings,
  defaultShellProfile,
  normalizeTerminalFontSize
} from "../lib/workspaceSettings";

type OnboardingPanelProps = {
  settings: AppSettings;
  platform: string;
  onOpenFolder: (defaultPath?: string) => Promise<string | undefined>;
  onComplete: (settings: AppSettings) => Promise<void>;
};

export function OnboardingPanel({ settings, platform, onOpenFolder, onComplete }: OnboardingPanelProps) {
  const initialPath = settings.workspace;
  const shell = useMemo(() => defaultShellProfile(platform), [platform]);
  const [workspacePath, setWorkspacePath] = useState(initialPath);
  const [workspaceName, setWorkspaceName] = useState(basename(initialPath) || "workspace");
  const [defaultCwd, setDefaultCwd] = useState(initialPath);
  const [fontSize, setFontSize] = useState("13");
  const [includeCodexProfile, setIncludeCodexProfile] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setWorkspacePath(initialPath);
    setWorkspaceName(basename(initialPath) || "workspace");
    setDefaultCwd(initialPath);
  }, [initialPath]);

  const chooseFolder = async () => {
    const selected = await onOpenFolder(workspacePath);
    if (!selected) {
      return;
    }
    setWorkspacePath(selected);
    setDefaultCwd(selected);
    setWorkspaceName((current) => current.trim() || basename(selected) || "workspace");
    setError("");
  };

  const completeOnboarding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const path = workspacePath.trim();
    if (!path) {
      setError("Choose a workspace folder.");
      return;
    }

    setStatus("saving");
    setError("");
    try {
      await onComplete(
        createInitialWorkspaceSettings(
          settings,
          {
            name: workspaceName,
            path,
            defaultCwd,
            terminalFontSize: normalizeTerminalFontSize(Number(fontSize)),
            includeCodexProfile
          },
          platform
        )
      );
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <main className="onboarding-shell">
      <section className="onboarding-panel" aria-labelledby="onboarding-title">
        <aside className="onboarding-summary">
          <div className="brand onboarding-brand">
            <TerminalSquare size={18} />
            <span>Pui</span>
          </div>
          <div>
            <h1 id="onboarding-title">Choose defaults</h1>
            <dl>
              <div>
                <dt>Shell</dt>
                <dd>{shell.name}</dd>
              </div>
              <div>
                <dt>Workspace</dt>
                <dd>{workspaceName || basename(workspacePath)}</dd>
              </div>
              <div>
                <dt>Profiles</dt>
                <dd>{includeCodexProfile ? "Shell, Codex" : "Shell"}</dd>
              </div>
            </dl>
          </div>
        </aside>

        <form className="onboarding-form" onSubmit={completeOnboarding}>
          <label htmlFor="onboarding-workspace-name">Workspace name</label>
          <input
            id="onboarding-workspace-name"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
          />

          <label htmlFor="onboarding-workspace-path">Workspace folder</label>
          <div className="settings-inline-control">
            <input
              id="onboarding-workspace-path"
              value={workspacePath}
              onChange={(event) => {
                setWorkspacePath(event.target.value);
                setError("");
              }}
            />
            <button type="button" onClick={() => void chooseFolder()}>
              <FolderOpen size={14} />
              Browse
            </button>
          </div>

          <label htmlFor="onboarding-default-cwd">Default working directory</label>
          <input
            id="onboarding-default-cwd"
            value={defaultCwd}
            onChange={(event) => setDefaultCwd(event.target.value)}
            placeholder={workspacePath}
          />

          <label htmlFor="onboarding-font-size">Terminal font size</label>
          <input
            id="onboarding-font-size"
            type="number"
            min={10}
            max={24}
            step={1}
            value={fontSize}
            onChange={(event) => setFontSize(event.target.value)}
          />

          <label className="settings-check-row">
            <input
              type="checkbox"
              checked={includeCodexProfile}
              onChange={(event) => setIncludeCodexProfile(event.target.checked)}
            />
            <span>Add Codex profile</span>
          </label>

          {error ? <p className="settings-error">{error}</p> : null}

          <button className="onboarding-primary" type="submit" disabled={status === "saving" || !workspacePath.trim()}>
            <Play size={14} />
            {status === "saving" ? "Saving" : "Start"}
          </button>
        </form>
      </section>
    </main>
  );
}
