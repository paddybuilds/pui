import { FormEvent, useState } from "react";
import { FolderPlus, X } from "lucide-react";

type WorkspaceModalProps = {
  defaultPath: string;
  onClose: () => void;
  onCreate: (input: { name: string; path: string }) => Promise<void>;
};

export function WorkspaceModal({ defaultPath, onClose, onCreate }: WorkspaceModalProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState(defaultPath);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim() || basename(path);
    const trimmedPath = path.trim();
    if (!trimmedPath || saving) {
      return;
    }
    setSaving(true);
    await onCreate({ name: trimmedName, path: trimmedPath });
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="workspace-modal" role="dialog" aria-modal="true" aria-label="Open folder" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <FolderPlus size={16} />
            <strong>Open folder</strong>
          </div>
          <button className="icon-button" type="button" title="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </header>
        <form onSubmit={submit}>
          <label htmlFor="workspace-name">Folder label</label>
          <input
            id="workspace-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Defaults to folder name"
          />
          <label htmlFor="workspace-path">Folder path</label>
          <input id="workspace-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder={defaultPath} />
          <footer>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={!path.trim() || saving}>
              {saving ? "Opening" : "Open folder"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "folder";
}
