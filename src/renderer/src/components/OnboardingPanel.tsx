import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FolderOpen, Play, TerminalSquare, X } from "lucide-react";
import type { ShellCandidate } from "../../../preload";
import type {
  AppDensity,
  AppSettings,
  GitPanelDefault,
  TerminalProfileTemplate,
  ThemePreset
} from "../../../shared/types";
import { getPuiApi } from "../lib/browserApi";
import {
  basename,
  createInitialWorkspaceSettings,
  defaultShellProfileTemplate,
  normalizeAppPreferences,
  normalizeTerminalFontSize
} from "../lib/workspaceSettings";

const pui = getPuiApi();
const ONBOARDING_VERSION = "customizable-v1";

type StepId = "welcome" | "workspace" | "terminal" | "appearance" | "workflow" | "review";

type OnboardingPanelProps = {
  settings: AppSettings;
  platform: string;
  onOpenFolder: (defaultPath?: string) => Promise<string | undefined>;
  onComplete: (settings: AppSettings) => Promise<void>;
  onCancel?: () => void;
};

const steps: Array<{ id: StepId; label: string }> = [
  { id: "welcome", label: "Welcome" },
  { id: "workspace", label: "Workspace" },
  { id: "terminal", label: "Terminal" },
  { id: "appearance", label: "Appearance" },
  { id: "workflow", label: "Workflow" },
  { id: "review", label: "Review" }
];

export function OnboardingPanel({ settings, platform, onOpenFolder, onComplete, onCancel }: OnboardingPanelProps) {
  const preferences = normalizeAppPreferences(settings.appPreferences, {
    defaultTerminalProfileId: settings.profiles[0]?.id
  });
  const initialPath = settings.workspace;
  const [stepIndex, setStepIndex] = useState(0);
  const [workspacePath, setWorkspacePath] = useState(initialPath);
  const [workspaceName, setWorkspaceName] = useState(basename(initialPath) || "workspace");
  const [defaultCwd, setDefaultCwd] = useState(initialPath);
  const [fontSize, setFontSize] = useState(String(preferences.terminalFontSize));
  const [includeCodexProfile, setIncludeCodexProfile] = useState(preferences.codexProfileEnabled);
  const [themePreset, setThemePreset] = useState<ThemePreset>(preferences.themePreset);
  const [density, setDensity] = useState<AppDensity>(preferences.density);
  const [gitPanelDefault, setGitPanelDefault] = useState<GitPanelDefault>(preferences.gitPanelDefault);
  const [updateChecksEnabled, setUpdateChecksEnabled] = useState(preferences.updateChecksEnabled);
  const [shells, setShells] = useState<ShellCandidate[]>([]);
  const [selectedShellId, setSelectedShellId] = useState(preferences.defaultTerminalProfileTemplate?.id ?? "");
  const [customCommand, setCustomCommand] = useState(preferences.defaultTerminalProfileTemplate?.command ?? "");
  const [customArgs, setCustomArgs] = useState(preferences.defaultTerminalProfileTemplate?.args.join(" ") ?? "");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setWorkspacePath(initialPath);
    setWorkspaceName(basename(initialPath) || "workspace");
    setDefaultCwd(initialPath);
  }, [initialPath]);

  useEffect(() => {
    let mounted = true;
    void pui.system
      .listShells()
      .then((items) => {
        if (!mounted) {
          return;
        }
        const available = items.filter((item) => item.available || item.source === "custom");
        setShells(available);
        setSelectedShellId((current) => current || available.find((item) => item.source !== "custom")?.id || "custom");
      })
      .catch(() => {
        if (mounted) {
          const fallback = defaultShellProfileTemplate(platform);
          setShells([{ id: "default", source: "system", available: true, ...fallback }]);
          setSelectedShellId("default");
        }
      });
    return () => {
      mounted = false;
    };
  }, [platform]);

  const currentStep = steps[stepIndex];
  const selectedShell = shells.find((shell) => shell.id === selectedShellId);
  const shellTemplate = useMemo(
    () => createShellTemplate(selectedShell, customCommand, customArgs, platform),
    [customArgs, customCommand, platform, selectedShell]
  );

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

  const goNext = () => {
    if (currentStep.id === "workspace" && !workspacePath.trim()) {
      setError("Choose a workspace folder.");
      return;
    }
    if (currentStep.id === "terminal" && !shellTemplate.command.trim()) {
      setError("Choose a terminal or enter a custom command.");
      return;
    }
    setError("");
    setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  };

  const completeOnboarding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspacePath.trim()) {
      setError("Choose a workspace folder.");
      return;
    }
    if (!shellTemplate.command.trim()) {
      setError("Choose a terminal or enter a custom command.");
      return;
    }

    setStatus("saving");
    setError("");
    try {
      await onComplete(
        createInitialWorkspaceSettings(
          {
            ...settings,
            appPreferences: normalizeAppPreferences({
              ...settings.appPreferences,
              themePreset,
              density,
              terminalFontSize: normalizeTerminalFontSize(Number(fontSize)),
              defaultTerminalProfileTemplate: shellTemplate,
              codexProfileEnabled: includeCodexProfile,
              gitPanelDefault,
              updateChecksEnabled,
              onboardingCompletedVersion: ONBOARDING_VERSION
            })
          },
          {
            name: workspaceName,
            path: workspacePath,
            defaultCwd,
            terminalFontSize: normalizeTerminalFontSize(Number(fontSize)),
            includeCodexProfile,
            defaultTerminalProfileTemplate: shellTemplate,
            onboardingCompletedVersion: ONBOARDING_VERSION
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
      <section className="onboarding-panel onboarding-wizard" aria-labelledby="onboarding-title">
        {onCancel ? (
          <button className="icon-button onboarding-close" type="button" title="Close onboarding" onClick={onCancel}>
            <X size={15} />
          </button>
        ) : null}
        <aside className="onboarding-summary">
          <div className="brand onboarding-brand">
            <TerminalSquare size={18} />
            <span>Pui</span>
          </div>
          <nav className="onboarding-steps" aria-label="Onboarding steps">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                className={index === stepIndex ? "active" : index < stepIndex ? "complete" : ""}
                onClick={() => setStepIndex(index)}
              >
                <span>{index < stepIndex ? <Check size={12} /> : index + 1}</span>
                <strong>{step.label}</strong>
              </button>
            ))}
          </nav>
        </aside>

        <form className="onboarding-form onboarding-wizard-form" onSubmit={completeOnboarding}>
          <header>
            <h1 id="onboarding-title">{currentStep.label}</h1>
          </header>

          {currentStep.id === "welcome" ? (
            <div className="onboarding-copy">
              <strong>Make Pui yours before the first terminal starts.</strong>
              <p>Choose the workspace, shell, appearance, and workflow defaults that new folders will inherit.</p>
            </div>
          ) : null}

          {currentStep.id === "workspace" ? (
            <div className="settings-form">
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
                  onChange={(event) => setWorkspacePath(event.target.value)}
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
              />
            </div>
          ) : null}

          {currentStep.id === "terminal" ? (
            <div className="settings-form">
              <label htmlFor="onboarding-shell">Default terminal</label>
              <select
                id="onboarding-shell"
                value={selectedShellId}
                onChange={(event) => setSelectedShellId(event.target.value)}
              >
                {shells.map((shell) => (
                  <option key={shell.id} value={shell.id}>
                    {shell.name}
                  </option>
                ))}
              </select>
              {selectedShell?.source === "custom" ? (
                <>
                  <label htmlFor="onboarding-custom-command">Custom command</label>
                  <input
                    id="onboarding-custom-command"
                    value={customCommand}
                    onChange={(event) => setCustomCommand(event.target.value)}
                    placeholder="pwsh, zsh, bash, fish"
                  />
                  <label htmlFor="onboarding-custom-args">Arguments</label>
                  <input
                    id="onboarding-custom-args"
                    value={customArgs}
                    onChange={(event) => setCustomArgs(event.target.value)}
                    placeholder="-NoLogo"
                  />
                </>
              ) : (
                <SettingPreview label="Command" value={[shellTemplate.command, ...shellTemplate.args].join(" ")} />
              )}
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
            </div>
          ) : null}

          {currentStep.id === "appearance" ? (
            <div className="settings-form">
              <label htmlFor="onboarding-theme">Theme</label>
              <select
                id="onboarding-theme"
                value={themePreset}
                onChange={(event) => setThemePreset(event.target.value as ThemePreset)}
              >
                <option value="system">System</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
              <label htmlFor="onboarding-density">Density</label>
              <select
                id="onboarding-density"
                value={density}
                onChange={(event) => setDensity(event.target.value as AppDensity)}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </div>
          ) : null}

          {currentStep.id === "workflow" ? (
            <div className="settings-form">
              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={includeCodexProfile}
                  onChange={(event) => setIncludeCodexProfile(event.target.checked)}
                />
                <span>Add Codex profile</span>
              </label>
              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={gitPanelDefault === "open"}
                  onChange={(event) => setGitPanelDefault(event.target.checked ? "open" : "closed")}
                />
                <span>Open Git panel by default</span>
              </label>
              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={updateChecksEnabled}
                  onChange={(event) => setUpdateChecksEnabled(event.target.checked)}
                />
                <span>Enable update checks</span>
              </label>
            </div>
          ) : null}

          {currentStep.id === "review" ? (
            <div className="settings-list onboarding-review">
              <SettingPreview label="Workspace" value={workspaceName || basename(workspacePath)} />
              <SettingPreview label="Folder" value={workspacePath} />
              <SettingPreview label="Terminal" value={shellTemplate.name} />
              <SettingPreview label="Appearance" value={`${themePreset}, ${density}`} />
              <SettingPreview label="Profiles" value={includeCodexProfile ? "Shell, Codex" : "Shell"} />
            </div>
          ) : null}

          {error ? <p className="settings-error">{error}</p> : null}

          <footer className="onboarding-actions">
            <button
              type="button"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft size={14} />
              Back
            </button>
            {currentStep.id === "review" ? (
              <button className="onboarding-primary" type="submit" disabled={status === "saving"}>
                <Play size={14} />
                {status === "saving" ? "Saving" : "Start"}
              </button>
            ) : (
              <button className="onboarding-primary" type="button" onClick={goNext}>
                Next
                <ChevronRight size={14} />
              </button>
            )}
          </footer>
        </form>
      </section>
    </main>
  );
}

function createShellTemplate(
  shell: ShellCandidate | undefined,
  customCommand: string,
  customArgs: string,
  platform: string
): TerminalProfileTemplate {
  if (!shell || shell.source === "custom") {
    const fallback = defaultShellProfileTemplate(platform);
    return {
      id: "custom",
      name: customCommand.trim() || "Custom",
      command: customCommand.trim() || fallback.command,
      args: splitArgs(customArgs),
      appearance: { color: "#9ca3af", icon: "terminal" }
    };
  }

  return {
    id: shell.id,
    name: shell.name,
    command: shell.command,
    args: shell.args,
    appearance: { color: "#9ca3af", icon: "terminal" }
  };
}

function splitArgs(value: string): string[] {
  return value
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
}

function SettingPreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}
