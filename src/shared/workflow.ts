import type { ConsoleProfile, QuickCommand, TerminalWorkspace } from "./types";

export function normalizeWorkspaceWorkflow(workspace: TerminalWorkspace): TerminalWorkspace {
  return {
    ...workspace,
    layoutPresets: workspace.layoutPresets ?? [],
    quickCommands: workspace.quickCommands ?? []
  };
}

export function createQuickCommandProfile(
  command: QuickCommand,
  workspace: TerminalWorkspace,
  idFactory: () => string
): ConsoleProfile {
  const cwd = command.cwd?.trim() || workspace.defaultCwd || workspace.path;
  return {
    id: idFactory(),
    name: command.name,
    cwd,
    command: command.command,
    args: command.args,
    env: command.env ?? {},
    shortcut: command.shortcut ?? "",
    appearance: {
      color: "#9ca3af",
      icon: "terminal"
    }
  };
}
