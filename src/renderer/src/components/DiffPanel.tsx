import { useEffect, useState } from "react";
import { RefreshCw, RotateCcw, Upload } from "lucide-react";
import type { GitDiff, GitFileStatus, GitStatus } from "../../../shared/types";
import { splitDiff } from "../lib/diff";

type DiffPanelProps = {
  workspace: string;
  status: GitStatus | null;
  onStatus: (status: GitStatus) => void;
};

export function DiffPanel({ workspace, status, onStatus }: DiffPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const files = status?.files ?? [];

  useEffect(() => {
    const nextFile = selectedFile ?? files[0]?.path;
    setSelectedFile(nextFile);
    if (nextFile) {
      void loadDiff(nextFile);
    } else {
      setDiff(null);
    }
  }, [status?.files.map((file) => file.path).join("|")]);

  const refresh = async () => {
    onStatus(await window.pui.git.status(workspace));
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
    <div className="diff-panel">
      <div className="diff-toolbar">
        <button type="button" onClick={refresh}>
          <RefreshCw size={14} />
          Refresh
        </button>
        <span>{status?.isRepo ? `${files.length} changed` : status?.error || "Not a Git repository"}</span>
      </div>

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
