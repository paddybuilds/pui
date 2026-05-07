import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch as GitBranchIcon, GitCommitHorizontal, RotateCcw, Upload, X } from "lucide-react";
import type {
  GitBranch,
  GitCommit,
  GitCommitDetails,
  GitCommitFile,
  GitCommitFileDiff,
  GitDiff,
  GitFileStatus,
  GitStatus
} from "../../../shared/types";
import { splitDiff } from "../lib/diff";
import { getPuiApi } from "../lib/browserApi";

type GitPanelProps = {
  workspace: string;
  status: GitStatus | null;
  onStatus: (status: GitStatus) => void;
};

const pui = getPuiApi();
const COMMIT_COMPOSER_MIN_HEIGHT = 150;
const COMMIT_COMPOSER_MAX_HEIGHT = 380;
const COMMIT_COMPOSER_DEFAULT_HEIGHT = 230;
const COMMIT_FILE_SIDEBAR_MIN_WIDTH = 220;
const COMMIT_FILE_SIDEBAR_MAX_WIDTH = 520;
const COMMIT_FILE_SIDEBAR_DEFAULT_WIDTH = 300;

export function GitPanel({ workspace, status, onStatus }: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<"changes" | "commits">("changes");
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [commitDetails, setCommitDetails] = useState<GitCommitDetails | null>(null);
  const [commitDetailsLoading, setCommitDetailsLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [commitComposerHeight, setCommitComposerHeight] = useState(COMMIT_COMPOSER_DEFAULT_HEIGHT);
  const commitDetailsRequest = useRef(0);
  const workingDiffRequest = useRef(0);
  const files = useMemo(() => status?.files ?? [], [status?.files]);
  const fileKey = useMemo(() => files.map((file) => file.path).join("|"), [files]);
  const stagedFiles = useMemo(
    () => files.filter((file) => file.indexStatus.trim() && file.indexStatus !== "?"),
    [files]
  );
  const unstagedFiles = useMemo(() => files.filter((file) => file.workingTreeStatus.trim()), [files]);
  const selectedPathSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const selectedUnstagedPaths = useMemo(
    () => unstagedFiles.filter((file) => selectedPathSet.has(file.path)).map((file) => file.path),
    [selectedPathSet, unstagedFiles]
  );
  const selectedStagedPaths = useMemo(
    () => stagedFiles.filter((file) => selectedPathSet.has(file.path)).map((file) => file.path),
    [selectedPathSet, stagedFiles]
  );

  const loadCommits = useCallback(async () => {
    setCommits(await pui.git.commits(workspace, 16));
  }, [workspace]);

  const loadBranches = useCallback(async () => {
    setBranchesLoading(true);
    try {
      setBranches(await pui.git.branches(workspace));
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : String(error));
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  }, [workspace]);

  const openWorkingDiff = useCallback(
    async (file: string) => {
      const requestId = workingDiffRequest.current + 1;
      workingDiffRequest.current = requestId;
      setSelectedFile(file);
      setDiff(null);
      setDiffLoading(true);
      const unstaged = await pui.git.diff(workspace, file, false);
      if (workingDiffRequest.current !== requestId) {
        return;
      }
      if (unstaged.text.trim()) {
        setDiff(unstaged);
        setDiffLoading(false);
        return;
      }
      const staged = await pui.git.diff(workspace, file, true);
      if (workingDiffRequest.current === requestId) {
        setDiff(staged);
        setDiffLoading(false);
      }
    },
    [workspace]
  );

  useEffect(() => {
    if (!status?.isRepo) {
      setSelectedFile(undefined);
      setDiff(null);
      setCommits([]);
      return;
    }

    void loadCommits();
    void loadBranches();
  }, [fileKey, files, loadBranches, loadCommits, status?.isRepo]);

  useEffect(() => {
    setOperationMessage("");
  }, [workspace, status?.branch]);

  useEffect(() => {
    const availablePaths = new Set(files.map((file) => file.path));
    setSelectedPaths((current) => current.filter((path) => availablePaths.has(path)));
  }, [files]);

  const togglePath = (file: string) => {
    setSelectedPaths((current) =>
      current.includes(file) ? current.filter((path) => path !== file) : [...current, file]
    );
  };

  const stage = async (paths: string[]) => {
    if (paths.length === 0) {
      return;
    }
    onStatus(await pui.git.stage(workspace, paths));
  };

  const unstage = async (paths: string[]) => {
    if (paths.length === 0) {
      return;
    }
    onStatus(await pui.git.unstage(workspace, paths));
  };

  const discard = async (file: string) => {
    const confirmed = window.confirm(`Discard working tree changes in ${file}? This cannot be undone.`);
    if (confirmed) {
      onStatus(await pui.git.discard(workspace, [file]));
    }
  };

  const switchBranch = async (branch: string) => {
    if (!branch || branch === status?.branch || switchingBranch) {
      return;
    }

    setSwitchingBranch(true);
    setOperationMessage("");
    try {
      const result = await pui.git.switchBranch(workspace, branch);
      if (!result.ok) {
        setOperationMessage(result.error || result.stderr || "Branch switch failed.");
        return;
      }

      const nextStatus = await pui.git.status(workspace);
      onStatus(nextStatus);
      await Promise.all([loadBranches(), loadCommits()]);
      setSelectedFile(undefined);
      setDiff(null);
      setSelectedPaths([]);
      setOperationMessage(result.stderr || `Switched to ${branch}.`);
    } finally {
      setSwitchingBranch(false);
    }
  };

  const openCommitDetails = async (commit: GitCommit) => {
    const requestId = commitDetailsRequest.current + 1;
    commitDetailsRequest.current = requestId;
    setCommitDetailsLoading(true);
    setCommitDetails(null);
    try {
      const details = await pui.git.commitDetails(workspace, commit.hash);
      if (commitDetailsRequest.current === requestId) {
        setCommitDetails(details);
      }
    } finally {
      if (commitDetailsRequest.current === requestId) {
        setCommitDetailsLoading(false);
      }
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

  const startCommitComposerResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    startVerticalResize(
      event,
      commitComposerHeight,
      setCommitComposerHeight,
      COMMIT_COMPOSER_MIN_HEIGHT,
      COMMIT_COMPOSER_MAX_HEIGHT,
      true
    );
  };

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <div>
          <strong>Git</strong>
          <label className="branch-select-label">
            <GitBranchIcon size={13} />
            <select
              value={status?.branch ?? ""}
              disabled={!status?.isRepo || branchesLoading || switchingBranch}
              aria-label="Switch Git branch"
              onChange={(event) => void switchBranch(event.target.value)}
            >
              {status?.branch ? <option value={status.branch}>{status.branch}</option> : null}
              {branches
                .filter((branch) => branch.name !== status?.branch)
                .map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.remote ? `${branch.name} (remote)` : branch.name}
                  </option>
                ))}
            </select>
          </label>
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
        <div
          className="git-tab-panel changes-tab-panel"
          role="tabpanel"
          style={{ gridTemplateRows: `minmax(0, 1fr) 6px ${commitComposerHeight}px` }}
        >
          <section className="changes-section">
            <header>
              <span>Changes</span>
              <small>{unstagedFiles.length} unstaged</small>
            </header>
            <div className="file-bulk-actions">
              <button
                type="button"
                disabled={selectedUnstagedPaths.length === 0}
                onClick={() => void stage(selectedUnstagedPaths)}
              >
                <Upload size={14} />
                Stage selected
              </button>
              <button
                type="button"
                disabled={unstagedFiles.length === 0}
                onClick={() => void stage(unstagedFiles.map((file) => file.path))}
              >
                Stage all
              </button>
              <button
                type="button"
                disabled={selectedStagedPaths.length === 0}
                onClick={() => void unstage(selectedStagedPaths)}
              >
                Unstage selected
              </button>
            </div>
            <div className="diff-body">
              <div className="file-list">
                {files.map((file) => (
                  <FileButton
                    key={file.path}
                    file={file}
                    active={file.path === selectedFile}
                    selected={selectedPathSet.has(file.path)}
                    onClick={() => void openWorkingDiff(file.path)}
                    onToggle={() => togglePath(file.path)}
                  />
                ))}
                {files.length === 0 ? <div className="empty-state">No changed files.</div> : null}
              </div>
            </div>
          </section>

          <div
            className="git-section-resizer"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize commit composer"
            onPointerDown={startCommitComposerResize}
          />

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
                <button
                  type="button"
                  disabled={committing || stagedFiles.length === 0 || !commitMessage.trim()}
                  onClick={() => void commit(false)}
                >
                  Commit
                </button>
                <button
                  type="button"
                  disabled={committing || stagedFiles.length === 0 || !commitMessage.trim()}
                  onClick={() => void commit(true)}
                >
                  Commit & Push
                </button>
              </div>
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
              <button
                key={commit.hash}
                type="button"
                className="commit-row"
                title={commit.hash}
                onClick={() => void openCommitDetails(commit)}
              >
                <strong>{commit.subject}</strong>
                <span>
                  {commit.shortHash} · {commit.author} · {commit.date}
                </span>
              </button>
            ))}
            {commits.length === 0 ? <div className="empty-state">No commits found.</div> : null}
          </div>
        </section>
      )}
      {operationMessage ? <p className="git-operation-message">{operationMessage}</p> : null}
      {commitDetails || commitDetailsLoading ? (
        <CommitDetailsModal
          workspace={workspace}
          commit={commitDetails}
          loading={commitDetailsLoading}
          onClose={() => {
            commitDetailsRequest.current += 1;
            setCommitDetails(null);
            setCommitDetailsLoading(false);
          }}
        />
      ) : null}
      {selectedFile ? (
        <WorkingDiffModal
          file={selectedFile}
          diff={diff}
          loading={diffLoading}
          onClose={() => {
            workingDiffRequest.current += 1;
            setSelectedFile(undefined);
            setDiff(null);
            setDiffLoading(false);
          }}
          onStage={async () => {
            onStatus(await pui.git.stage(workspace, [selectedFile]));
            setSelectedFile(undefined);
            setDiff(null);
          }}
          onUnstage={async () => {
            onStatus(await pui.git.unstage(workspace, [selectedFile]));
            setSelectedFile(undefined);
            setDiff(null);
          }}
          onDiscard={async () => {
            await discard(selectedFile);
            setSelectedFile(undefined);
            setDiff(null);
          }}
        />
      ) : null}
    </div>
  );
}

function FileButton({
  file,
  active,
  selected,
  onClick,
  onToggle
}: {
  file: GitFileStatus;
  active: boolean;
  selected: boolean;
  onClick: () => void;
  onToggle: () => void;
}) {
  const staged = file.indexStatus.trim() || "-";
  const unstaged = file.workingTreeStatus.trim() || "-";
  const pathParts = file.path.split(/[\\/]/);
  const fileName = pathParts.pop() ?? file.path;
  const directory = pathParts.join("/");
  return (
    <div className={active ? "file-row active" : "file-row"}>
      <input
        type="checkbox"
        className="file-select"
        checked={selected}
        aria-label={`Select ${file.path}`}
        onChange={onToggle}
      />
      <button type="button" className="file-button" onClick={onClick}>
        <span className="file-name-group">
          <strong>{fileName}</strong>
          {directory ? <small>{directory}</small> : null}
        </span>
        <span className="file-status">
          <span>{staged}</span>
          <span>{unstaged}</span>
        </span>
      </button>
    </div>
  );
}

function CommitDetailsModal({
  workspace,
  commit,
  loading,
  onClose
}: {
  workspace: string;
  commit: GitCommitDetails | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [fileDiff, setFileDiff] = useState<GitCommitFileDiff | null>(null);
  const [fileDiffLoading, setFileDiffLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(COMMIT_FILE_SIDEBAR_DEFAULT_WIDTH);
  const fileDiffRequest = useRef(0);
  const totals = useMemo(() => {
    const additions = commit?.files.reduce((total, file) => total + (file.additions ?? 0), 0) ?? 0;
    const deletions = commit?.files.reduce((total, file) => total + (file.deletions ?? 0), 0) ?? 0;
    return { additions, deletions };
  }, [commit]);

  const loadFileDiff = useCallback(
    async (file: string) => {
      if (!commit) {
        return;
      }
      const requestId = fileDiffRequest.current + 1;
      fileDiffRequest.current = requestId;
      setSelectedFile(file);
      setFileDiff(null);
      setFileDiffLoading(true);
      try {
        const diff = await pui.git.commitFileDiff(workspace, commit.hash, file);
        if (fileDiffRequest.current === requestId) {
          setFileDiff(diff);
        }
      } finally {
        if (fileDiffRequest.current === requestId) {
          setFileDiffLoading(false);
        }
      }
    },
    [commit, workspace]
  );

  useEffect(() => {
    setFileDiff(null);
    const firstFile = commit?.files[0]?.path;
    setSelectedFile(firstFile);
    if (firstFile) {
      void loadFileDiff(firstFile);
    }
  }, [commit, loadFileDiff]);

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const initialX = event.clientX;
    const initialWidth = sidebarWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        COMMIT_FILE_SIDEBAR_MAX_WIDTH,
        Math.max(COMMIT_FILE_SIDEBAR_MIN_WIDTH, initialWidth + moveEvent.clientX - initialX)
      );
      setSidebarWidth(nextWidth);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div className="commit-details-backdrop" onMouseDown={onClose}>
      <section
        className="commit-details-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Commit details"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Commit details</span>
            <strong>{commit?.subject ?? "Loading commit"}</strong>
          </div>
          <button type="button" aria-label="Close commit details" onClick={onClose}>
            <X size={15} />
          </button>
        </header>
        {loading ? <div className="empty-state">Loading commit details.</div> : null}
        {commit ? (
          <div className="commit-details-content">
            <div className="commit-details-meta">
              <dl className="commit-metadata">
                <div>
                  <dt>Hash</dt>
                  <dd>{commit.hash}</dd>
                </div>
                <div>
                  <dt>Author</dt>
                  <dd>
                    {commit.author} &lt;{commit.authorEmail}&gt;
                  </dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{commit.date}</dd>
                </div>
              </dl>
              {commit.body ? <pre className="commit-body">{commit.body}</pre> : null}
              <div className="commit-file-summary">
                <span>{commit.files.length} files</span>
                <span className="additions">+{totals.additions}</span>
                <span className="deletions">-{totals.deletions}</span>
              </div>
            </div>
            <div className="commit-review" style={{ gridTemplateColumns: `${sidebarWidth}px 6px minmax(0, 1fr)` }}>
              <aside className="commit-file-sidebar" aria-label="Files changed in commit">
                {commit.files.map((file) => (
                  <CommitFileButton
                    key={file.path}
                    file={file}
                    active={file.path === selectedFile}
                    onClick={() => void loadFileDiff(file.path)}
                  />
                ))}
              </aside>
              <div
                className="commit-review-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize file list"
                onPointerDown={startSidebarResize}
              />
              <section className="commit-diff-pane" aria-label="Selected commit file diff">
                <header>
                  <strong>{selectedFile ?? "No file selected"}</strong>
                  {fileDiffLoading ? <span>Loading</span> : null}
                </header>
                <pre className="commit-diff-code">
                  {fileDiff?.text ? (
                    <DiffBlock text={fileDiff.text} />
                  ) : (
                    <div className="empty-state">
                      {fileDiffLoading ? "Loading file diff." : "Select a file to review its diff."}
                    </div>
                  )}
                </pre>
              </section>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function WorkingDiffModal({
  file,
  diff,
  loading,
  onClose,
  onStage,
  onUnstage,
  onDiscard
}: {
  file: string;
  diff: GitDiff | null;
  loading: boolean;
  onClose: () => void;
  onStage: () => Promise<void>;
  onUnstage: () => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  return (
    <div className="diff-modal-backdrop" onMouseDown={onClose}>
      <section
        className="diff-modal"
        role="dialog"
        aria-modal="true"
        aria-label="File diff"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>File diff</span>
            <strong title={file}>{file}</strong>
          </div>
          <button type="button" aria-label="Close file diff" onClick={onClose}>
            <X size={15} />
          </button>
        </header>
        <div className="diff-modal-actions">
          <button type="button" onClick={() => void onStage()}>
            <Upload size={14} />
            Stage
          </button>
          <button type="button" onClick={() => void onUnstage()}>
            Unstage
          </button>
          <button type="button" className="danger" onClick={() => void onDiscard()}>
            <RotateCcw size={14} />
            Discard
          </button>
        </div>
        <pre className="diff-modal-code">
          {diff?.text ? (
            <DiffBlock text={diff.text} />
          ) : (
            <div className="empty-state">{loading ? "Loading file diff." : "No diff available for this file."}</div>
          )}
        </pre>
      </section>
    </div>
  );
}

function startVerticalResize(
  event: ReactPointerEvent<HTMLDivElement>,
  initialValue: number,
  onResize: (value: number) => void,
  min: number,
  max: number,
  invert = false
): void {
  event.preventDefault();
  const initialY = event.clientY;

  const onPointerMove = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientY - initialY;
    const nextValue = Math.min(max, Math.max(min, initialValue + (invert ? -delta : delta)));
    onResize(nextValue);
  };

  const onPointerUp = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function DiffBlock({ text }: { text: string }) {
  return (
    <>
      {splitDiff(text).map((line, index) => (
        <div key={index} className={`diff-line ${line.type}`}>
          <span className="diff-line-number">{line.oldLine ?? ""}</span>
          <span className="diff-line-number">{line.newLine ?? ""}</span>
          <span className="diff-line-text">{line.text || " "}</span>
        </div>
      ))}
    </>
  );
}

function CommitFileButton({ file, active, onClick }: { file: GitCommitFile; active: boolean; onClick: () => void }) {
  const pathParts = file.path.split(/[\\/]/);
  const fileName = pathParts.pop() ?? file.path;
  const directory = pathParts.join("/");

  return (
    <button type="button" className={active ? "commit-file-button active" : "commit-file-button"} onClick={onClick}>
      <span>
        <strong>{fileName}</strong>
        {directory ? <small>{directory}</small> : null}
      </span>
      <code>
        <span className="additions">+{file.additions ?? "-"}</span>
        <span className="deletions">-{file.deletions ?? "-"}</span>
      </code>
    </button>
  );
}
