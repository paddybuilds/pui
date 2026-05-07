import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import type { CodexRunCommandOptions } from "../shared/codexCommand";
import { ipc } from "../shared/ipc";
import type { AppSettings, CodexStatus, ConsoleProfile } from "../shared/types";
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
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "Pui",
    backgroundColor: "#111318",
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 20, y: 20 } : undefined,
    titleBarOverlay: isMac
      ? undefined
      : {
          color: "#0b0f14",
          symbolColor: "#9ca3af",
          height: 44
    },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
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
    const options = {
      title: "Open folder",
      buttonLabel: "Open Folder",
      defaultPath: defaultPath && existsSync(defaultPath) ? defaultPath : undefined,
      properties: ["openDirectory"] as Array<"openDirectory">
    };
    const result = await dialog.showOpenDialog(mainWindow, options);
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

  const writeTerminal = (payload: { sessionId: string; data: string }) => {
    terminalService?.write(payload.sessionId, payload.data);
  };
  const resizeTerminal = (payload: { sessionId: string; cols: number; rows: number }) => {
    terminalService?.resize(payload.sessionId, payload.cols, payload.rows);
  };

  ipcMain.handle(ipc.terminal.write, (_event, payload: { sessionId: string; data: string }) => writeTerminal(payload));
  ipcMain.on(ipc.terminal.write, (_event, payload: { sessionId: string; data: string }) => writeTerminal(payload));
  ipcMain.handle(ipc.terminal.resize, (_event, payload: { sessionId: string; cols: number; rows: number }) =>
    resizeTerminal(payload)
  );
  ipcMain.on(ipc.terminal.resize, (_event, payload: { sessionId: string; cols: number; rows: number }) =>
    resizeTerminal(payload)
  );
  ipcMain.handle(ipc.terminal.kill, (_event, sessionId: string) => terminalService?.kill(sessionId));

  ipcMain.handle(ipc.codex.run, (_event, payload: { prompt: string; workspace: string; options?: CodexRunCommandOptions }) => {
    return codexAdapter?.run(payload.prompt, payload.workspace, payload.options);
  });
  ipcMain.handle(ipc.codex.cancel, (_event, runId: string) => codexAdapter?.cancel(runId));
  ipcMain.handle(ipc.codex.status, () => getCodexStatus());

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
  ipcMain.handle(ipc.git.commit, (_event, payload: { workspace: string; message: string }) => {
    return gitService?.commit(payload.workspace, payload.message);
  });
  ipcMain.handle(ipc.git.push, (_event, workspace: string) => gitService?.push(workspace));
  ipcMain.handle(ipc.git.watch, (_event, workspace: string) => gitService?.watch(workspace));
}

async function getCodexStatus(): Promise<CodexStatus> {
  const command = "codex";
  const lookupCommand = process.platform === "win32" ? "where.exe" : "sh";
  const args = process.platform === "win32" ? [command] : ["-lc", `command -v ${command}`];
  return new Promise((resolve) => {
    execFile(lookupCommand, args, { windowsHide: true }, (error, stdout, stderr) => {
      const resolvedPath = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
      resolve({
        available: !error && Boolean(resolvedPath),
        command,
        resolvedPath,
        error: error ? stderr.trim() || error.message : undefined
      });
    });
  });
}
