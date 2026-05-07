import { useEffect, useState } from "react";
import { GitCommitHorizontal, RefreshCw, RotateCcw, Upload } from "lucide-react";
import type { GitCommit, GitDiff, GitFileStatus, GitStatus } from "../../../shared/types";
import { splitDiff } from "../lib/diff";

type GitPanelProps = {
  workspace: string;
  status: GitStatus | null;
  onStatus: (status: GitStatus) => void;
};

export function GitPanel({ workspace, status, onStatus }: GitPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const files = status?.files ?? [];

  useEffect(() => {
    if (!status?.isRepo) {
      setSelectedFile(undefined);
      setDiff(null);
      setCommits([]);
      return;
    }

    const nextFile = selectedFile ?? files[0]?.path;
    setSelectedFile(nextFile);
    if (nextFile) {
      void loadDiff(nextFile);
    } else {
      setDiff(null);
    }
    void loadCommits();
  }, [status?.files.map((file) => file.path).join("|")]);

  const refresh = async () => {
    const nextStatus = await window.pui.git.status(workspace);
    onStatus(nextStatus);
    if (nextStatus.isRepo) {
      await loadCommits();
    }
  };

  const loadCommits = async () => {
    setCommits(await window.pui.git.commits(workspace, 16));
  };

  const loadDiff = async (file: string) => {
    setSelectedFile(file);
    const unstaged = await window.pui.git.diff(workspace, file, false);
    if (unstaged.text.trim()) {
      setDiff(unstaged);
      return;
    }
    setDiff(await window.pui.git.diff(workspace, file, true));
  };

  const stage = async (file: string) => {
    onStatus(await window.pui.git.stage(workspace, [file]));
  };

  const unstage = async (file: string) => {
    onStatus(await window.pui.git.unstage(workspace, [file]));
  };

  const discard = async (file: string) => {
    const confirmed = window.confirm(`Discard working tree changes in ${file}? This cannot be undone.`);
    if (confirmed) {
      onStatus(await window.pui.git.discard(workspace, [file]));
    }
  };

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <div>
          <strong>Git</strong>
          <span>{status?.branch ?? "Repository"}</span>
        </div>
        <button type="button" onClick={refresh}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <section className="commit-section">
        <header>
          <GitCommitHorizontal size={14} />
          <span>Recent commits</span>
        </header>
        <div className="commit-list">
          {commits.map((commit) => (
            <article key={commit.hash} className="commit-row" title={commit.hash}>
              <strong>{commit.subject}</strong>
              <span>
                {commit.shortHash} · {commit.author} · {commit.date}
              </span>
            </article>
          ))}
          {commits.length === 0 ? <div className="empty-state">No commits found.</div> : null}
        </div>
      </section>

      <section className="changes-section">
        <header>
          <span>Changes</span>
          <small>{files.length} changed</small>
        </header>
        <div className="diff-body">
          <div className="file-list">
            {files.map((file) => (
              <FileButton
                key={file.path}
                file={file}
                active={file.path === selectedFile}
                onClick={() => loadDiff(file.path)}
              />
            ))}
            {files.length === 0 ? <div className="empty-state">No changed files.</div> : null}
          </div>

          <div className="diff-view">
            {selectedFile ? (
              <div className="file-actions">
                <strong>{selectedFile}</strong>
                <div className="file-action-buttons">
                  <button type="button" onClick={() => stage(selectedFile)}>
                    <Upload size={14} />
                    Stage
                  </button>
                  <button type="button" onClick={() => unstage(selectedFile)}>
                    Unstage
                  </button>
                  <button type="button" className="danger" onClick={() => discard(selectedFile)}>
                    <RotateCcw size={14} />
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
            <pre className="diff-code">
              {diff?.text ? (
                splitDiff(diff.text).map((line, index) => (
                  <div key={index} className={`diff-line ${line.type}`}>
                    {line.text || " "}
                  </div>
                ))
              ) : (
                <div className="empty-state">Select a file to review changes.</div>
              )}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}

function FileButton({
  file,
  active,
  onClick
}: {
  file: GitFileStatus;
  active: boolean;
  onClick: () => void;
}) {
  const staged = file.indexStatus.trim() || "-";
  const unstaged = file.workingTreeStatus.trim() || "-";
  return (
    <button type="button" className={active ? "file-button active" : "file-button"} onClick={onClick}>
      <span className="file-status">
        {staged}
        {unstaged}
      </span>
      <span>{file.path}</span>
    </button>
  );
}
