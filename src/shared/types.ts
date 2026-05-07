export type ConsoleProfile = {
  id: string;
  name: string;
  cwd: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  shortcut: string;
  appearance: {
    color: string;
    icon: string;
  };
};

export type TerminalSession = {
  id: string;
  profileId: string;
  cwd: string;
  paneId: string;
  ptyProcessId: number;
  status: "running" | "exited";
};

export type CodexRunStatus = "running" | "completed" | "failed" | "cancelled";

export type CodexEvent = {
  timestamp: string;
  type: string;
  message: string;
  raw: unknown;
};

export type CodexRun = {
  id: string;
  workspace: string;
  prompt: string;
  status: CodexRunStatus;
  startedAt: string;
  endedAt?: string;
  events: CodexEvent[];
  exitCode?: number | null;
};

export type GitFileStatus = {
  path: string;
  indexStatus: string;
  workingTreeStatus: string;
};

export type GitStatus = {
  workspace: string;
  isRepo: boolean;
  branch?: string;
  files: GitFileStatus[];
  error?: string;
};

export type GitDiff = {
  workspace: string;
  file?: string;
  text: string;
  cached: boolean;
};

export type GitCommit = {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
};

export type AppSettings = {
  workspace: string;
  profiles: ConsoleProfile[];
  recentWorkspaces: string[];
  activeWorkspaceId?: string;
  workspaces?: TerminalWorkspace[];
  layout?: WorkbenchLayout;
};

export type WorkbenchPane = {
  id: string;
  profileId?: string;
};

export type WorkbenchLayout = {
  activePaneId: string;
  root: WorkbenchNode;
  direction?: "right" | "down";
  panes?: WorkbenchPane[];
};

export type WorkbenchNode =
  | {
      type: "pane";
      id: string;
      profileId?: string;
    }
  | {
      type: "split";
      id: string;
      direction: "right" | "down";
      children: WorkbenchNode[];
      sizes?: number[];
    };

export type TerminalWorkspace = {
  id: string;
  name: string;
  path: string;
  defaultCwd?: string;
  terminalFontSize?: number;
  profiles: ConsoleProfile[];
  layout: WorkbenchLayout;
};
