import { FormEvent, useState } from "react";
import { Play, Square } from "lucide-react";
import type { CodexRun } from "../../../shared/types";

type CodexPanelProps = {
  workspace: string;
  runs: CodexRun[];
  onRefreshGit: () => void;
};

export function CodexPanel({ workspace, runs, onRefreshGit }: CodexPanelProps) {
  const [prompt, setPrompt] = useState("");
  const running = runs.find((run) => run.status === "running");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }
    await window.pui.codex.run(trimmed, workspace);
    setPrompt("");
  };

  return (
    <div className="codex-panel">
      <form className="codex-form" onSubmit={submit}>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask Codex to work in this folder..."
          rows={5}
        />
        <div className="codex-actions">
          <button type="submit" disabled={!prompt.trim() || Boolean(running)}>
            <Play size={15} />
            Run
          </button>
          <button type="button" disabled={!running} onClick={() => running && window.pui.codex.cancel(running.id)}>
            <Square size={15} />
            Stop
          </button>
          <button type="button" onClick={onRefreshGit}>
            Refresh Git
          </button>
        </div>
      </form>

      <div className="run-list">
        {runs.length === 0 ? <div className="empty-state">No Codex runs yet.</div> : null}
        {runs.map((run) => (
          <article key={run.id} className="run-card">
            <header>
              <span className={`status ${run.status}`}>{run.status}</span>
              <time>{new Date(run.startedAt).toLocaleTimeString()}</time>
            </header>
            <p>{run.prompt}</p>
            <div className="event-log">
              {run.events.slice(-12).map((event, index) => (
                <div key={`${run.id}-${index}`} className="event-line">
                  <span>{event.type}</span>
                  <code>{event.message}</code>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
