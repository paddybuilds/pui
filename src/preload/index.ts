import { contextBridge, ipcRenderer } from "electron";
import { ipc } from "../shared/ipc";
import type {
  AppSettings,
  AppUpdateSnapshot,
  AppVersionInfo,
  CodexHookEvent,
  CodexHookInstallResult,
  GitBranch,
  GitCommit,
  GitCommitDetails,
  GitCommitFileDiff,
  GitDiff,
  FilePathListResult,
  FileSystemEntry,
  FileSystemMutationResult,
  FileReadResult,
  FileWriteResult,
  GitOperationResult,
  GitStatus,
  SettingsLoadState,
  TerminalPaneSnapshot,
  TerminalSession,
  TitleBarTheme
} from "../shared/types";

export type ShellCandidate = {
  id: string;
  name: string;
  command: string;
  args: string[];
  source: "environment" | "system" | "wsl" | "custom";
  available: boolean;
};

const api = {
  platform: process.platform,
  app: {
    getVersionInfo: () => ipcRenderer.invoke(ipc.app.versionInfo) as Promise<AppVersionInfo>,
    checkForUpdates: () => ipcRenderer.invoke(ipc.app.checkForUpdates) as Promise<AppUpdateSnapshot>,
    downloadUpdate: () => ipcRenderer.invoke(ipc.app.downloadUpdate) as Promise<AppUpdateSnapshot>,
    installDownloadedUpdate: () => ipcRenderer.invoke(ipc.app.installDownloadedUpdate) as Promise<AppUpdateSnapshot>,
    onUpdateStatus: (callback: (status: AppUpdateSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: AppUpdateSnapshot) => callback(status);
      ipcRenderer.on(ipc.app.updateStatus, listener);
      return () => {
        ipcRenderer.removeListener(ipc.app.updateStatus, listener);
      };
    },
    setTitleBarTheme: (theme: TitleBarTheme) => ipcRenderer.invoke(ipc.app.setTitleBarTheme, theme)
  },
  dialog: {
    openFolder: (defaultPath?: string) =>
      ipcRenderer.invoke(ipc.dialog.openFolder, defaultPath) as Promise<string | undefined>
  },
  settings: {
    loadState: () => ipcRenderer.invoke(ipc.settings.loadState) as Promise<SettingsLoadState>,
    load: () => ipcRenderer.invoke(ipc.settings.load) as Promise<AppSettings>,
    save: (settings: AppSettings) => ipcRenderer.invoke(ipc.settings.save, settings) as Promise<AppSettings>,
    saveTerminalSnapshots: (snapshots: Record<string, Record<string, TerminalPaneSnapshot>>) =>
      ipcRenderer.invoke(ipc.settings.saveTerminalSnapshots, snapshots) as Promise<AppSettings>
  },
  system: {
    listShells: () => ipcRenderer.invoke(ipc.system.listShells) as Promise<ShellCandidate[]>
  },
  clipboard: {
    readText: () => ipcRenderer.invoke(ipc.clipboard.readText) as Promise<string>,
    writeText: (text: string) => ipcRenderer.invoke(ipc.clipboard.writeText, text) as Promise<void>
  },
  fileSystem: {
    readDirectory: (workspace: string, directory?: string) =>
      ipcRenderer.invoke(ipc.fileSystem.readDirectory, { workspace, directory }) as Promise<FileSystemEntry[]>,
    listFilePaths: (workspace: string) =>
      ipcRenderer.invoke(ipc.fileSystem.listFilePaths, workspace) as Promise<FilePathListResult>,
    readFile: (workspace: string, filePath: string) =>
      ipcRenderer.invoke(ipc.fileSystem.readFile, { workspace, filePath }) as Promise<FileReadResult>,
    writeFile: (workspace: string, filePath: string, contents: string) =>
      ipcRenderer.invoke(ipc.fileSystem.writeFile, { workspace, filePath, contents }) as Promise<FileWriteResult>,
    createFile: (workspace: string, directory: string, name: string) =>
      ipcRenderer.invoke(ipc.fileSystem.createFile, {
        workspace,
        directory,
        name
      }) as Promise<FileSystemMutationResult>,
    createDirectory: (workspace: string, directory: string, name: string) =>
      ipcRenderer.invoke(ipc.fileSystem.createDirectory, {
        workspace,
        directory,
        name
      }) as Promise<FileSystemMutationResult>,
    rename: (workspace: string, target: string, name: string) =>
      ipcRenderer.invoke(ipc.fileSystem.rename, { workspace, target, name }) as Promise<FileSystemMutationResult>,
    delete: (workspace: string, target: string) =>
      ipcRenderer.invoke(ipc.fileSystem.delete, { workspace, target }) as Promise<FileSystemMutationResult>
  },
  terminal: {
    create: (payload: unknown) => ipcRenderer.invoke(ipc.terminal.create, payload) as Promise<TerminalSession>,
    write: (sessionId: string, data: string) => {
      ipcRenderer.send(ipc.terminal.write, { sessionId, data });
      return Promise.resolve();
    },
    resize: (sessionId: string, cols: number, rows: number) => {
      ipcRenderer.send(ipc.terminal.resize, { sessionId, cols, rows });
      return Promise.resolve();
    },
    kill: (sessionId: string) => ipcRenderer.invoke(ipc.terminal.kill, sessionId),
    onData: (callback: (payload: { sessionId: string; data: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { sessionId: string; data: string }) =>
        callback(payload);
      ipcRenderer.on(ipc.terminal.data, listener);
      return () => {
        ipcRenderer.removeListener(ipc.terminal.data, listener);
      };
    },
    onExit: (callback: (payload: { sessionId: string; exitCode: number; signal?: number }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { sessionId: string; exitCode: number; signal?: number }
      ) => callback(payload);
      ipcRenderer.on(ipc.terminal.exit, listener);
      return () => {
        ipcRenderer.removeListener(ipc.terminal.exit, listener);
      };
    }
  },
  codex: {
    installHooks: () => ipcRenderer.invoke(ipc.codex.installHooks) as Promise<CodexHookInstallResult>,
    onSubagentDetected: (callback: (event: CodexHookEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: CodexHookEvent) => callback(payload);
      ipcRenderer.on(ipc.codex.subagentDetected, listener);
      return () => {
        ipcRenderer.removeListener(ipc.codex.subagentDetected, listener);
      };
    }
  },
  git: {
    status: (workspace: string) => ipcRenderer.invoke(ipc.git.status, workspace) as Promise<GitStatus>,
    branches: (workspace: string) => ipcRenderer.invoke(ipc.git.branches, workspace) as Promise<GitBranch[]>,
    switchBranch: (workspace: string, branch: string) =>
      ipcRenderer.invoke(ipc.git.switchBranch, { workspace, branch }) as Promise<GitOperationResult>,
    diff: (workspace: string, file?: string, cached = false) =>
      ipcRenderer.invoke(ipc.git.diff, { workspace, file, cached }) as Promise<GitDiff>,
    commits: (workspace: string, limit = 16) =>
      ipcRenderer.invoke(ipc.git.commits, { workspace, limit }) as Promise<GitCommit[]>,
    commitDetails: (workspace: string, hash: string) =>
      ipcRenderer.invoke(ipc.git.commitDetails, { workspace, hash }) as Promise<GitCommitDetails>,
    commitFileDiff: (workspace: string, hash: string, file: string) =>
      ipcRenderer.invoke(ipc.git.commitFileDiff, { workspace, hash, file }) as Promise<GitCommitFileDiff>,
    stage: (workspace: string, paths: string[]) =>
      ipcRenderer.invoke(ipc.git.stage, { workspace, paths }) as Promise<GitStatus>,
    unstage: (workspace: string, paths: string[]) =>
      ipcRenderer.invoke(ipc.git.unstage, { workspace, paths }) as Promise<GitStatus>,
    discard: (workspace: string, paths: string[]) =>
      ipcRenderer.invoke(ipc.git.discard, { workspace, paths }) as Promise<GitStatus>,
    commit: (workspace: string, message: string) =>
      ipcRenderer.invoke(ipc.git.commit, { workspace, message }) as Promise<GitOperationResult>,
    push: (workspace: string) => ipcRenderer.invoke(ipc.git.push, workspace) as Promise<GitOperationResult>,
    watch: (workspace: string) => ipcRenderer.invoke(ipc.git.watch, workspace),
    unwatch: (workspace: string) => ipcRenderer.invoke(ipc.git.unwatch, workspace),
    onChanged: (callback: (payload: { workspace: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { workspace: string }) => callback(payload);
      ipcRenderer.on(ipc.git.changed, listener);
      return () => {
        ipcRenderer.removeListener(ipc.git.changed, listener);
      };
    }
  }
};

contextBridge.exposeInMainWorld("pui", api);

export type PuiApi = typeof api;
