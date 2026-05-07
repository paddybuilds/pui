import { FormEvent, useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import type { AppSettings, GitStatus } from "../../../shared/types";

type WorkspaceBarProps = {
  settings: AppSettings;
  gitStatus: GitStatus | null;
  onSaveWorkspace: (workspace: string) => void;
};

export function WorkspaceBar({ settings, gitStatus, onSaveWorkspace }: WorkspaceBarProps) {
  const [workspace, setWorkspace] = useState(settings.workspace);

  useEffect(() => {
    setWorkspace(settings.workspace);
  }, [settings.workspace]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (workspace.trim()) {
      onSaveWorkspace(workspace.trim());
    }
  };

  return (
    <form className="workspace-bar" onSubmit={submit}>
      <FolderOpen size={16} />
      <input value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
      <button type="submit">Set</button>
      <span className={gitStatus?.isRepo ? "repo-pill ok" : "repo-pill"}>{gitStatus?.isRepo ? gitStatus.branch : "No repo"}</span>
    </form>
  );
}
