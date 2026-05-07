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

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export type CodexPromptTemplate = {
  id: string;
  name: string;
  prompt: string;
};

export type CodexAddonPreferences = {
  enabled: boolean;
  defaultModel: string;
  defaultSandbox: CodexSandboxMode;
  interactiveProfileEnabled: boolean;
  defaultPromptTemplates: CodexPromptTemplate[];
};

export type AppPreferences = {
  codexProfileEnabled?: boolean;
  codexAddon?: CodexAddonPreferences;
};

export type CodexWorkspacePreferences = Partial<CodexAddonPreferences>;

export type CodexStatus = {
  available: boolean;
  command: string;
  resolvedPath?: string;
  error?: string;
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

export type GitOperationResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
};

export type AppSettings = {
  workspace: string;
  profiles: ConsoleProfile[];
  recentWorkspaces: string[];
  activeWorkspaceId?: string;
  appPreferences?: AppPreferences;
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

export type LayoutPreset = {
  id: string;
  name: string;
  description?: string;
  root: WorkbenchNode;
  activePaneId: string;
  createdAt: string;
  updatedAt: string;
};

export type QuickCommand = {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  shortcut?: string;
  splitDirection: "right" | "down";
};

export type TerminalWorkspace = {
  id: string;
  name: string;
  kind?: "folder" | "quick";
  path: string;
  defaultCwd?: string;
  terminalFontSize?: number;
  profiles: ConsoleProfile[];
  layout: WorkbenchLayout;
  layoutPresets?: LayoutPreset[];
  quickCommands?: QuickCommand[];
  codexAddon?: CodexWorkspacePreferences;
};
