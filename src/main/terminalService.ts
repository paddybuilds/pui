import path from "node:path";
import { BrowserWindow } from "electron";
import pty, { type IPty } from "node-pty";
import { ipc } from "../shared/ipc";
import type { ConsoleProfile, TerminalSession } from "../shared/types";
import { defaultShell, resolveProfileShell } from "./shell";

type SessionRecord = {
  session: TerminalSession;
  pty: IPty;
  pendingData: string;
  flushScheduled: boolean;
  lastCols: number;
  lastRows: number;
};

export class TerminalService {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly window: BrowserWindow) {}

  create(profile: ConsoleProfile, paneId: string, cols: number, rows: number): TerminalSession {
    const sessionId = crypto.randomUUID();
    const cwd = profile.cwd || process.cwd();
    const shell = resolveProfileShell(profile.command, profile.args);
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PROMPT_EOL_MARK: "",
      ...profile.env
    };

    const child = pty.spawn(shell.command, shell.args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: path.resolve(cwd),
      env
    });

    const session: TerminalSession = {
      id: sessionId,
      profileId: profile.id,
      cwd,
      paneId,
      ptyProcessId: child.pid,
      status: "running"
    };

    child.onData((data) => {
      this.queueData(sessionId, data);
    });

    child.onExit(({ exitCode, signal }) => {
      const record = this.sessions.get(sessionId);
      if (!record) {
        return;
      }
      this.flushData(sessionId, record);
      record.session.status = "exited";
      this.send(ipc.terminal.exit, { sessionId, exitCode, signal });
      this.sessions.delete(sessionId);
    });

    this.sessions.set(sessionId, { session, pty: child, pendingData: "", flushScheduled: false, lastCols: cols, lastRows: rows });
    return session;
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) {
      const record = this.sessions.get(sessionId);
      if (!record || (record.lastCols === cols && record.lastRows === rows)) {
        return;
      }
      record.lastCols = cols;
      record.lastRows = rows;
      record.pty.resize(cols, rows);
    }
  }

  kill(sessionId: string): void {
    this.sessions.get(sessionId)?.pty.kill();
    this.sessions.delete(sessionId);
  }

  killAll(): void {
    for (const id of this.sessions.keys()) {
      this.kill(id);
    }
  }

  private queueData(sessionId: string, data: string): void {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    record.pendingData += data;
    if (record.flushScheduled) {
      return;
    }

    record.flushScheduled = true;
    setImmediate(() => {
      this.flushData(sessionId, record);
    });
  }

  private flushData(sessionId: string, record: SessionRecord): void {
    record.flushScheduled = false;
    const data = record.pendingData;
    if (!data || this.sessions.get(sessionId) !== record) {
      record.pendingData = "";
      return;
    }

    record.pendingData = "";
    this.send(ipc.terminal.data, { sessionId, data });
  }

  private send(channel: string, payload: unknown): void {
    if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
      try {
        this.window.webContents.send(channel, payload);
      } catch {
        // The renderer can disappear while node-pty is still flushing exit data during app shutdown.
      }
    }
  }

  static defaultShellName(): string {
    return defaultShell().name;
  }
}
