import path from "node:path";
import { BrowserWindow } from "electron";
import pty, { type IPty } from "node-pty";
import { ipc } from "../shared/ipc";
import type { ConsoleProfile, TerminalSession } from "../shared/types";
import { defaultShell, resolveProfileShell } from "./shell";

type SessionRecord = {
  session: TerminalSession;
  pty: IPty;
  pendingChunks: string[];
  pendingBytes: number;
  droppedBytes: number;
  flushScheduled: boolean;
  lastCols: number;
  lastRows: number;
};

const MAX_PENDING_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_FLUSH_BYTES = 128 * 1024;

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

    this.sessions.set(sessionId, {
      session,
      pty: child,
      pendingChunks: [],
      pendingBytes: 0,
      droppedBytes: 0,
      flushScheduled: false,
      lastCols: cols,
      lastRows: rows
    });
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

    record.pendingChunks.push(data);
    record.pendingBytes += data.length;
    trimPendingOutput(record);
    this.scheduleDataFlush(sessionId, record);
  }

  private flushData(sessionId: string, record: SessionRecord): void {
    record.flushScheduled = false;
    const data = takePendingOutput(record, MAX_OUTPUT_FLUSH_BYTES);
    if (!data || this.sessions.get(sessionId) !== record) {
      clearPendingOutput(record);
      return;
    }

    this.send(ipc.terminal.data, { sessionId, data });
    if (record.pendingBytes > 0) {
      this.scheduleDataFlush(sessionId, record);
    }
  }

  private scheduleDataFlush(sessionId: string, record: SessionRecord): void {
    if (record.flushScheduled) {
      return;
    }

    record.flushScheduled = true;
    setImmediate(() => {
      this.flushData(sessionId, record);
    });
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

function trimPendingOutput(record: SessionRecord): void {
  while (record.pendingBytes > MAX_PENDING_OUTPUT_BYTES && record.pendingChunks.length > 0) {
    const first = record.pendingChunks[0];
    const overflow = record.pendingBytes - MAX_PENDING_OUTPUT_BYTES;
    if (first.length <= overflow) {
      record.pendingChunks.shift();
      record.pendingBytes -= first.length;
      record.droppedBytes += first.length;
      continue;
    }

    record.pendingChunks[0] = first.slice(overflow);
    record.pendingBytes -= overflow;
    record.droppedBytes += overflow;
  }
}

function takePendingOutput(record: SessionRecord, maxBytes: number): string {
  const parts: string[] = [];
  let remaining = maxBytes;

  if (record.droppedBytes > 0) {
    const notice = `\r\n[pui skipped ${record.droppedBytes} bytes of terminal output]\r\n`;
    parts.push(notice);
    remaining = Math.max(0, remaining - notice.length);
    record.droppedBytes = 0;
  }

  while (remaining > 0 && record.pendingChunks.length > 0) {
    const first = record.pendingChunks[0];
    if (first.length <= remaining) {
      parts.push(first);
      record.pendingChunks.shift();
      record.pendingBytes -= first.length;
      remaining -= first.length;
      continue;
    }

    parts.push(first.slice(0, remaining));
    record.pendingChunks[0] = first.slice(remaining);
    record.pendingBytes -= remaining;
    remaining = 0;
  }

  return parts.join("");
}

function clearPendingOutput(record: SessionRecord): void {
  record.pendingChunks = [];
  record.pendingBytes = 0;
  record.droppedBytes = 0;
}
