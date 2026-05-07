import { type ReactNode, useMemo, useState } from "react";
import { ArrowDownToLine, GitCompare, PanelRightOpen, Play, Save, Sparkles, Square, TerminalSquare } from "lucide-react";
import type { LayoutPreset, QuickCommand, TerminalWorkspace } from "../../../shared/types";
import { shortcutLabel } from "../lib/shortcuts";

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
  platform: string;
  layoutPresets: LayoutPreset[];
  quickCommands: QuickCommand[];
  onSaveLayoutPreset: () => void;
  onApplyLayoutPreset: (preset: LayoutPreset) => void;
  onRunQuickCommand: (command: QuickCommand) => void;
  showGit: boolean;
  onShowGit: () => void;
  showCodex: boolean;
  hasActiveCodexRun: boolean;
  onOpenCodex: () => void;
  onOpenCodexTerminal: () => void;
  onRunCodexTask: () => void;
  onCancelCodexRun: () => void;
};

export function CommandPalette({
  workspaces,
  onClose,
  onOpenWorkspace,
  onSplitRight,
  onSplitDown,
  platform,
  layoutPresets,
  quickCommands,
  onSaveLayoutPreset,
  onApplyLayoutPreset,
  onRunQuickCommand,
  showGit,
  onShowGit,
  showCodex,
  hasActiveCodexRun,
  onOpenCodex,
  onOpenCodexTerminal,
  onRunCodexTask,
  onCancelCodexRun
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const commands = useMemo<PaletteCommand[]>(
    () => {
      const baseCommands: PaletteCommand[] = [
        ...workspaces.map((workspace) => ({
          id: `workspace:${workspace.id}`,
          label: `Switch to folder ${workspace.name}`,
          shortcut: "",
          action: () => onOpenWorkspace(workspace)
        })),
        {
          id: "split-right",
          label: "Split pane right",
          shortcut: shortcutLabel("CmdOrCtrl+D", platform),
          action: onSplitRight,
          icon: <PanelRightOpen size={16} />
        },
        {
          id: "split-down",
          label: "Split pane down",
          shortcut: shortcutLabel("CmdOrCtrl+Shift+D", platform),
          action: onSplitDown,
          icon: <ArrowDownToLine size={16} />
        },
        { id: "save-layout", label: "Save current layout preset", shortcut: "", action: onSaveLayoutPreset, icon: <Save size={16} /> },
        ...layoutPresets.map((preset) => ({
          id: `preset:${preset.id}`,
          label: `Apply layout ${preset.name}`,
          shortcut: "",
          action: () => onApplyLayoutPreset(preset),
          icon: <PanelRightOpen size={16} />
        })),
        ...quickCommands.map((command) => ({
          id: `quick-command:${command.id}`,
          label: `Run ${command.name}`,
          shortcut: command.shortcut ?? "",
          action: () => onRunQuickCommand(command),
          icon: <Play size={16} />
        }))
      ];
      const gitCommands = showGit
        ? [{ id: "git", label: "Open Git sidebar", shortcut: "", action: onShowGit, icon: <GitCompare size={16} /> }]
        : [];
      const codexCommands = showCodex
        ? [
            { id: "codex-open", label: "Open Codex Addon", shortcut: "", action: onOpenCodex, icon: <Sparkles size={16} /> },
            {
              id: "codex-terminal",
              label: "Open interactive Codex terminal",
              shortcut: "",
              action: onOpenCodexTerminal,
              icon: <TerminalSquare size={16} />
            },
            { id: "codex-run", label: "Run Codex task", shortcut: "", action: onRunCodexTask, icon: <Play size={16} /> },
            ...(hasActiveCodexRun
              ? [{ id: "codex-cancel", label: "Cancel active Codex run", shortcut: "", action: onCancelCodexRun, icon: <Square size={16} /> }]
              : [])
          ]
        : [];
      return [...baseCommands, ...gitCommands, ...codexCommands];
    },
    [
      layoutPresets,
      onApplyLayoutPreset,
      onOpenWorkspace,
      onRunQuickCommand,
      onSaveLayoutPreset,
      onShowGit,
      onOpenCodex,
      onOpenCodexTerminal,
      onRunCodexTask,
      onCancelCodexRun,
      onSplitDown,
      onSplitRight,
      platform,
      quickCommands,
      hasActiveCodexRun,
      showCodex,
      showGit,
      workspaces
    ]
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
