import { type FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Play, Settings, Sparkles, Square, TerminalSquare, XCircle } from "lucide-react";
import type { AppSettings, CodexRun, CodexStatus, CodexAddonPreferences, TerminalWorkspace } from "../../../shared/types";
import { resolveCodexAddonPreferences } from "../../../shared/codexAddon";
import { getPuiApi } from "../lib/browserApi";

type CodexAddonPanelProps = {
  settings: AppSettings;
  activeWorkspace: TerminalWorkspace;
  activeRun: CodexRun | null;
  recentRuns: CodexRun[];
  onOpenTerminal: () => void;
  onRunStarted: (run: CodexRun) => void;
  onCancelRun: (runId: string) => void;
  onOpenSettings: () => void;
  onWorkspaceChange: (workspace: TerminalWorkspace) => Promise<void>;
};

const pui = getPuiApi();

export function CodexAddonPanel({
  settings,
  activeWorkspace,
  activeRun,
  recentRuns,
  onOpenTerminal,
  onRunStarted,
  onCancelRun,
  onOpenSettings,
  onWorkspaceChange
}: CodexAddonPanelProps) {
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [runError, setRunError] = useState("");
  const [saving, setSaving] = useState(false);
  const preferences = useMemo(() => resolveCodexAddonPreferences(settings, activeWorkspace), [activeWorkspace, settings]);
  const codexProfile = activeWorkspace.profiles.find((profile) => isCodexProfile(profile.command));
  const canRun = Boolean(status?.available && preferences.enabled && prompt.trim() && !activeRun);

  useEffect(() => {
    let cancelled = false;
    void pui.codex
      .status()
      .then((nextStatus) => {
        if (!cancelled) {
          setStatus(nextStatus);
          setStatusError("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus({ available: false, command: "codex", error: error instanceof Error ? error.message : String(error) });
          setStatusError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runCodexTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRun) {
      return;
    }
    setRunError("");
    try {
      const run = await pui.codex.run(prompt.trim(), activeWorkspace.path, {
        model: preferences.defaultModel.trim() || undefined,
        sandbox: preferences.defaultSandbox
      });
      onRunStarted(run);
      setPrompt("");
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    }
  };

  const updateWorkspacePreferences = async (next: Partial<CodexAddonPreferences>) => {
    setSaving(true);
    await onWorkspaceChange({
      ...activeWorkspace,
      codexAddon: {
        ...(activeWorkspace.codexAddon ?? {}),
        ...next
      }
    });
    setSaving(false);
  };

  return (
    <aside className="workspace-side-panel codex-addon-panel">
      <header className="codex-addon-header">
        <div>
          <strong>Codex Addon</strong>
          <span>{activeWorkspace.name}</span>
        </div>
        <button className="icon-button" type="button" title="Codex settings" onClick={onOpenSettings}>
          <Settings size={15} />
        </button>
      </header>

      <section className={status?.available ? "codex-status available" : "codex-status unavailable"}>
        {status?.available ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        <div>
          <strong>{status?.available ? "Codex is available" : "Codex is not available"}</strong>
          <span>{status?.resolvedPath || status?.error || statusError || "Install the Codex CLI and restart Pui."}</span>
        </div>
      </section>

      <section className="codex-actions">
        <button type="button" onClick={onOpenTerminal} disabled={!preferences.interactiveProfileEnabled}>
          <TerminalSquare size={15} />
          <span>{codexProfile ? "Open Terminal" : "Add Terminal"}</span>
        </button>
        {activeRun ? (
          <button type="button" onClick={() => onCancelRun(activeRun.id)}>
            <Square size={14} />
            <span>Cancel Run</span>
          </button>
        ) : null}
      </section>

      <form className="codex-composer" onSubmit={runCodexTask}>
        <label htmlFor="codex-task-prompt">Task prompt</label>
        <textarea
          id="codex-task-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask Codex to inspect, review, fix, or implement something in this workspace..."
        />
        <div className="codex-template-list">
          {preferences.defaultPromptTemplates.map((template) => (
            <button key={template.id} type="button" onClick={() => setPrompt(template.prompt)}>
              <Sparkles size={13} />
              <span>{template.name}</span>
            </button>
          ))}
        </div>
        <button type="submit" disabled={!canRun}>
          <Play size={15} />
          <span>{activeRun ? "Running" : "Run Task"}</span>
        </button>
        {runError ? <p className="codex-error">{runError}</p> : null}
      </form>

      <section className="codex-preferences">
        <label>
          <span>Enabled for workspace</span>
          <input
            type="checkbox"
            checked={preferences.enabled}
            disabled={saving}
            onChange={(event) => void updateWorkspacePreferences({ enabled: event.target.checked })}
          />
        </label>
        <label>
          <span>Sandbox</span>
          <select
            value={preferences.defaultSandbox}
            disabled={saving}
            onChange={(event) => void updateWorkspacePreferences({ defaultSandbox: event.target.value as CodexAddonPreferences["defaultSandbox"] })}
          >
            <option value="read-only">Read only</option>
            <option value="workspace-write">Workspace write</option>
            <option value="danger-full-access">Danger full access</option>
          </select>
        </label>
        <label>
          <span>Model</span>
          <input
            value={preferences.defaultModel}
            disabled={saving}
            onChange={(event) => void updateWorkspacePreferences({ defaultModel: event.target.value })}
            placeholder="CLI default"
          />
        </label>
      </section>

      <section className="codex-run-list">
        <strong>{activeRun ? "Active run" : "Recent runs"}</strong>
        {(activeRun ? [activeRun] : recentRuns).slice(0, 5).map((run) => (
          <article key={run.id} className={`codex-run-card ${run.status}`}>
            <div>
              <span>{run.status}</span>
              <time>{new Date(run.startedAt).toLocaleTimeString()}</time>
            </div>
            <p>{run.prompt}</p>
            <pre>{run.events.at(-1)?.message || "Waiting for Codex output..."}</pre>
          </article>
        ))}
        {!activeRun && recentRuns.length === 0 ? <p>No Codex runs yet.</p> : null}
      </section>
    </aside>
  );
}

function isCodexProfile(command: string): boolean {
  return command.toLowerCase() === "codex" || command.toLowerCase().endsWith("\\codex.exe");
}
