import { type ReactNode, useMemo, useState } from "react";
import { ArrowDownToLine, GitCompare, PanelRightOpen, Sparkles } from "lucide-react";
import type { TerminalWorkspace } from "../../../shared/types";

type PaletteCommand = {
  id: string;
  label: string;
  shortcut: string;
  action: () => void;
  icon?: ReactNode;
};

type CommandPaletteProps = {
  workspaces: TerminalWorkspace[];
  onClose: () => void;
  onOpenWorkspace: (workspace: TerminalWorkspace) => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onShowCodex: () => void;
  onShowDiff: () => void;
};

export function CommandPalette({
  workspaces,
  onClose,
  onOpenWorkspace,
  onSplitRight,
  onSplitDown,
  onShowCodex,
  onShowDiff
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const commands = useMemo<PaletteCommand[]>(
    () => [
      ...workspaces.map((workspace) => ({
        id: `workspace:${workspace.id}`,
        label: `Switch to folder ${workspace.name}`,
        shortcut: "",
        action: () => onOpenWorkspace(workspace)
      })),
      { id: "split-right", label: "Split pane right", shortcut: "⌘D", action: onSplitRight, icon: <PanelRightOpen size={16} /> },
      { id: "split-down", label: "Split pane down", shortcut: "⇧⌘D", action: onSplitDown, icon: <ArrowDownToLine size={16} /> },
      { id: "codex", label: "Open Codex drawer", shortcut: "⌘J", action: onShowCodex, icon: <Sparkles size={16} /> },
      { id: "diff", label: "Open diff drawer", shortcut: "", action: onShowDiff, icon: <GitCompare size={16} /> }
    ],
    [onOpenWorkspace, onShowCodex, onShowDiff, onSplitDown, onSplitRight, workspaces]
  );
  const filtered = commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Run command..." />
        <div className="palette-list">
          {filtered.map((command) => (
            <button
              key={command.id}
              type="button"
              onClick={() => {
                command.action();
                onClose();
              }}
            >
              <span>{command.icon ?? null}</span>
              <span>{command.label}</span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
