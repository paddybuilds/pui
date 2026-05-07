import { contextBridge, ipcRenderer } from "electron";
import { ipc } from "../shared/ipc";
import type { AppSettings, CodexRun, GitCommit, GitDiff, GitStatus, TerminalSession } from "../shared/types";

const api = {
  platform: process.platform,
  dialog: {
    openFolder: (defaultPath?: string) => ipcRenderer.invoke(ipc.dialog.openFolder, defaultPath) as Promise<string | undefined>
  },
  settings: {
    load: () => ipcRenderer.invoke(ipc.settings.load) as Promise<AppSettings>,
    save: (settings: AppSettings) => ipcRenderer.invoke(ipc.settings.save, settings) as Promise<AppSettings>
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
  codex: {
    run: (prompt: string, workspace: string) => ipcRenderer.invoke(ipc.codex.run, { prompt, workspace }) as Promise<CodexRun>,
    cancel: (runId: string) => ipcRenderer.invoke(ipc.codex.cancel, runId),
    onEvent: (callback: (payload: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
      ipcRenderer.on(ipc.codex.event, listener);
      return () => {
        ipcRenderer.removeListener(ipc.codex.event, listener);
      };
    },
    onUpdate: (callback: (run: CodexRun) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, run: CodexRun) => callback(run);
      ipcRenderer.on(ipc.codex.update, listener);
      return () => {
        ipcRenderer.removeListener(ipc.codex.update, listener);
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
