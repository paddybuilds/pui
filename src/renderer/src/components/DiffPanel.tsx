import { useEffect, useState } from "react";
import { GitCommitHorizontal, RotateCcw, Upload } from "lucide-react";
import type { GitCommit, GitDiff, GitFileStatus, GitStatus } from "../../../shared/types";
import { splitDiff } from "../lib/diff";
import { getPuiApi } from "../lib/browserApi";

type GitPanelProps = {
  workspace: string;
  status: GitStatus | null;
  onStatus: (status: GitStatus) => void;
};

const pui = getPuiApi();

export function GitPanel({ workspace, status, onStatus }: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<"changes" | "commits">("changes");
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const files = status?.files ?? [];
  const stagedFiles = files.filter((file) => file.indexStatus.trim() && file.indexStatus !== "?");
  const unstagedFiles = files.filter((file) => file.workingTreeStatus.trim());

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

  const loadCommits = async () => {
    setCommits(await pui.git.commits(workspace, 16));
  };

  const loadDiff = async (file: string) => {
    setSelectedFile(file);
    const unstaged = await pui.git.diff(workspace, file, false);
    if (unstaged.text.trim()) {
      setDiff(unstaged);
      return;
    }
    setDiff(await pui.git.diff(workspace, file, true));
  };

  const stage = async (file: string) => {
    onStatus(await pui.git.stage(workspace, [file]));
  };

  const unstage = async (file: string) => {
    onStatus(await pui.git.unstage(workspace, [file]));
  };

  const discard = async (file: string) => {
    const confirmed = window.confirm(`Discard working tree changes in ${file}? This cannot be undone.`);
    if (confirmed) {
      onStatus(await pui.git.discard(workspace, [file]));
    }
  };

  const commit = async (pushAfterCommit = false) => {
    const message = commitMessage.trim();
    if (!message || stagedFiles.length === 0) {
      return;
    }

    setCommitting(true);
    setOperationMessage("");
    const commitResult = await pui.git.commit(workspace, message);
    if (!commitResult.ok) {
      setOperationMessage(commitResult.error || commitResult.stderr || "Commit failed.");
      setCommitting(false);
      return;
    }

    if (pushAfterCommit) {
      const pushResult = await pui.git.push(workspace);
      if (!pushResult.ok) {
        setOperationMessage(pushResult.error || pushResult.stderr || "Commit succeeded, but push failed.");
        setCommitting(false);
        onStatus(await pui.git.status(workspace));
        await loadCommits();
        return;
      }
      setOperationMessage(pushResult.stdout || pushResult.stderr || "Committed and pushed.");
    } else {
      setOperationMessage(commitResult.stdout || commitResult.stderr || "Committed.");
    }

    setCommitMessage("");
    onStatus(await pui.git.status(workspace));
    await loadCommits();
    setCommitting(false);
  };

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <div>
          <strong>Git</strong>
          <span>{status?.branch ?? "Repository"}</span>
        </div>
        <div className="git-summary" aria-label="Git summary">
          <span>{files.length} changed</span>
          <span>{stagedFiles.length} staged</span>
        </div>
      </div>

      <div className="git-tabs" role="tablist" aria-label="Git sidebar sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "changes"}
          className={activeTab === "changes" ? "active" : ""}
          onClick={() => setActiveTab("changes")}
        >
          <span>Changes</span>
          {files.length ? <small>{files.length}</small> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "commits"}
          className={activeTab === "commits" ? "active" : ""}
          onClick={() => setActiveTab("commits")}
        >
          <span>Commits</span>
          {commits.length ? <small>{commits.length}</small> : null}
        </button>
      </div>

      {activeTab === "changes" ? (
        <div className="git-tab-panel changes-tab-panel" role="tabpanel">
          <section className="changes-section">
            <header>
              <span>Changes</span>
              <small>{unstagedFiles.length} unstaged</small>
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
                    <strong title={selectedFile}>{selectedFile}</strong>
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

          <section className="commit-composer">
            <header>
              <span>Commit & push</span>
              <small>{stagedFiles.length} staged</small>
            </header>
            <div className="commit-form">
              <textarea
                value={commitMessage}
                onChange={(event) => {
                  setCommitMessage(event.target.value);
                  setOperationMessage("");
                }}
                placeholder="Commit message"
              />
              <div className="file-action-buttons">
                <button type="button" disabled={committing || stagedFiles.length === 0 || !commitMessage.trim()} onClick={() => void commit(false)}>
                  Commit
                </button>
                <button type="button" disabled={committing || stagedFiles.length === 0 || !commitMessage.trim()} onClick={() => void commit(true)}>
                  Commit & Push
                </button>
              </div>
              {operationMessage ? <p className="git-operation-message">{operationMessage}</p> : null}
            </div>
          </section>
        </div>
      ) : (
        <section className="git-tab-panel commit-section" role="tabpanel">
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
      )}
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
  const pathParts = file.path.split(/[\\/]/);
  const fileName = pathParts.pop() ?? file.path;
  const directory = pathParts.join("/");
  return (
    <button type="button" className={active ? "file-button active" : "file-button"} onClick={onClick}>
      <span className="file-status">
        {staged}
        {unstaged}
      </span>
      <span className="file-name-group">
        <strong>{fileName}</strong>
        {directory ? <small>{directory}</small> : null}
      </span>
    </button>
  );
}
