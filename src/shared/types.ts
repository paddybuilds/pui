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

export type GitCommitFile = {
  path: string;
  additions: number | null;
  deletions: number | null;
};

export type GitCommitDetails = GitCommit & {
  authorEmail: string;
  body: string;
  files: GitCommitFile[];
};

export type GitCommitFileDiff = {
  workspace: string;
  hash: string;
  file: string;
  text: string;
};

export type GitOperationResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
};

export type FileSystemEntry = {
  name: string;
  path: string;
  relativePath: string;
  kind: "file" | "directory";
};

export type FileReadResult = {
  path: string;
  relativePath: string;
  name: string;
  contents: string;
  size: number;
  modifiedAt: string;
};

export type FileWriteResult = {
  path: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
};

export type AppVersionInfo = {
  name: string;
  version: string;
  commitSha?: string;
  commitShortSha?: string;
  repositoryUrl?: string;
  updateCheckConfigured: boolean;
};

export type AppUpdateCheckStatus = "update-available" | "up-to-date" | "unavailable" | "error";

export type AppUpdateCheckResult = {
  status: AppUpdateCheckStatus;
  currentVersion: string;
  checkedAt: string;
  message: string;
  latestVersion?: string;
  releaseUrl?: string;
  repositoryUrl?: string;
};

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

export type AppUpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

export type AppUpdateSnapshot = {
  status: AppUpdateStatus;
  currentVersion: string;
  message: string;
  installReady: boolean;
  installSupported: boolean;
  checkedAt?: string;
  latestVersion?: string;
  releaseUrl?: string;
  repositoryUrl?: string;
  releaseNotes?: string;
  progress?: AppUpdateProgress;
};

export type TitleBarTheme = {
  color: string;
  symbolColor: string;
};

export type ThemePreset = "system" | "light" | "dark";

export type AppDensity = "comfortable" | "compact";

export type GitPanelDefault = "open" | "closed";

export type AppThemeToken =
  | "surfaceRoot"
  | "surfaceSidebar"
  | "surfacePanel"
  | "surfaceRaised"
  | "surfaceHover"
  | "surfaceActive"
  | "lineSoft"
  | "lineStrong"
  | "textStrong"
  | "text"
  | "textMuted"
  | "textFaint"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "terminalBackground"
  | "terminalForeground"
  | "terminalCursor"
  | "terminalSelection";

export type AppThemeTokens = Partial<Record<AppThemeToken, string>>;

export type TerminalProfileTemplate = {
  id?: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  appearance?: ConsoleProfile["appearance"];
};

export type AppPreferences = {
  themePreset: ThemePreset;
  density: AppDensity;
  terminalFontSize: number;
  customTheme?: AppThemeTokens;
  defaultTerminalProfileId?: string;
  defaultTerminalProfileTemplate?: TerminalProfileTemplate;
  gitPanelDefault: GitPanelDefault;
  updateChecksEnabled: boolean;
  onboardingCompletedVersion?: string;
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  themePreset: "system",
  density: "comfortable",
  terminalFontSize: 13,
  gitPanelDefault: "open",
  updateChecksEnabled: true
};

export type AppSettings = {
  workspace: string;
  profiles: ConsoleProfile[];
  recentWorkspaces: string[];
  appPreferences?: AppPreferences;
  activeWorkspaceId?: string;
  workspaces?: TerminalWorkspace[];
  layout?: WorkbenchLayout;
};

export type SettingsLoadState = {
  settings: AppSettings;
  isFirstLaunch: boolean;
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
};
