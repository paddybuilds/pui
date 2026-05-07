import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { ipc } from "../shared/ipc";
import type { AppSettings, ConsoleProfile } from "../shared/types";
import { CodexCliAdapter } from "./codexAdapter";
import { GitWorkspaceService } from "./gitService";
import { StoreService } from "./store";
import { TerminalService } from "./terminalService";

let mainWindow: BrowserWindow | undefined;
let terminalService: TerminalService | undefined;
let codexAdapter: CodexCliAdapter | undefined;
let gitService: GitWorkspaceService | undefined;

const storeService = new StoreService();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "Pui",
    backgroundColor: "#111318",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  terminalService = new TerminalService(mainWindow);
  codexAdapter = new CodexCliAdapter(mainWindow);
  gitService = new GitWorkspaceService(mainWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  terminalService?.killAll();
  void gitService?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpc(): void {
  ipcMain.handle(ipc.dialog.openFolder, async (_event, defaultPath?: string) => {
    if (!mainWindow) {
      return undefined;
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath,
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle(ipc.settings.load, () => storeService.loadSettings());
  ipcMain.handle(ipc.settings.save, (_event, settings: AppSettings) => storeService.saveSettings(settings));

  ipcMain.handle(
    ipc.terminal.create,
    (_event, payload: { profile: ConsoleProfile; paneId: string; cols: number; rows: number }) => {
      return terminalService?.create(payload.profile, payload.paneId, payload.cols, payload.rows);
    }
  );
  ipcMain.handle(ipc.terminal.write, (_event, payload: { sessionId: string; data: string }) => {
    terminalService?.write(payload.sessionId, payload.data);
  });
  ipcMain.handle(ipc.terminal.resize, (_event, payload: { sessionId: string; cols: number; rows: number }) => {
    terminalService?.resize(payload.sessionId, payload.cols, payload.rows);
  });
  ipcMain.handle(ipc.terminal.kill, (_event, sessionId: string) => terminalService?.kill(sessionId));

  ipcMain.handle(ipc.codex.run, (_event, payload: { prompt: string; workspace: string }) => {
    return codexAdapter?.run(payload.prompt, payload.workspace);
  });
  ipcMain.handle(ipc.codex.cancel, (_event, runId: string) => codexAdapter?.cancel(runId));

  ipcMain.handle(ipc.git.status, (_event, workspace: string) => gitService?.getStatus(workspace));
  ipcMain.handle(ipc.git.diff, (_event, payload: { workspace: string; file?: string; cached?: boolean }) => {
    return gitService?.getDiff(payload.workspace, payload.file, payload.cached);
  });
  ipcMain.handle(ipc.git.commits, (_event, payload: { workspace: string; limit?: number }) => {
    return gitService?.getRecentCommits(payload.workspace, payload.limit);
  });
  ipcMain.handle(ipc.git.stage, (_event, payload: { workspace: string; paths: string[] }) => {
    return gitService?.stage(payload.workspace, payload.paths);
  });
  ipcMain.handle(ipc.git.unstage, (_event, payload: { workspace: string; paths: string[] }) => {
    return gitService?.unstage(payload.workspace, payload.paths);
  });
  ipcMain.handle(ipc.git.discard, (_event, payload: { workspace: string; paths: string[] }) => {
    return gitService?.discard(payload.workspace, payload.paths);
  });
  ipcMain.handle(ipc.git.watch, (_event, workspace: string) => gitService?.watch(workspace));
}
