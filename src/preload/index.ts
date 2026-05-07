import { contextBridge, ipcRenderer } from "electron";
import { ipc } from "../shared/ipc";
import type {
  AppSettings,
  AppUpdateCheckResult,
  AppVersionInfo,
  GitCommit,
  GitDiff,
  GitOperationResult,
  GitStatus,
  SettingsLoadState,
  TerminalSession
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
    checkForUpdates: () => ipcRenderer.invoke(ipc.app.checkForUpdates) as Promise<AppUpdateCheckResult>
  },
  dialog: {
    openFolder: (defaultPath?: string) =>
      ipcRenderer.invoke(ipc.dialog.openFolder, defaultPath) as Promise<string | undefined>
  },
  settings: {
    loadState: () => ipcRenderer.invoke(ipc.settings.loadState) as Promise<SettingsLoadState>,
    load: () => ipcRenderer.invoke(ipc.settings.load) as Promise<AppSettings>,
    save: (settings: AppSettings) => ipcRenderer.invoke(ipc.settings.save, settings) as Promise<AppSettings>
  },
  system: {
    listShells: () => ipcRenderer.invoke(ipc.system.listShells) as Promise<ShellCandidate[]>
  },
  terminal: {
    create: (payload: unknown) => ipcRenderer.invoke(ipc.terminal.create, payload) as Promise<TerminalSession>,
    write: (sessionId: string, data: string) => ipcRenderer.invoke(ipc.terminal.write, { sessionId, data }),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(ipc.terminal.resize, { sessionId, cols, rows }),
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
  git: {
    status: (workspace: string) => ipcRenderer.invoke(ipc.git.status, workspace) as Promise<GitStatus>,
    diff: (workspace: string, file?: string, cached = false) =>
      ipcRenderer.invoke(ipc.git.diff, { workspace, file, cached }) as Promise<GitDiff>,
    commits: (workspace: string, limit = 16) =>
      ipcRenderer.invoke(ipc.git.commits, { workspace, limit }) as Promise<GitCommit[]>,
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
