import os from "node:os";
import path from "node:path";
import { BrowserWindow } from "electron";
import pty, { type IPty } from "node-pty";
import { ipc } from "../shared/ipc";
import type { ConsoleProfile, TerminalSession } from "../shared/types";

type SessionRecord = {
  session: TerminalSession;
  pty: IPty;
};

export class TerminalService {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly window: BrowserWindow) {}

  create(profile: ConsoleProfile, paneId: string, cols: number, rows: number): TerminalSession {
    const sessionId = crypto.randomUUID();
    const cwd = profile.cwd || process.cwd();
    const shell = profile.command || process.env.SHELL || "/bin/zsh";
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PROMPT_EOL_MARK: "",
      ...profile.env
    };

    const child = pty.spawn(shell, profile.args || [], {
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
      this.window.webContents.send(ipc.terminal.data, { sessionId, data });
    });

    child.onExit(({ exitCode, signal }) => {
      const record = this.sessions.get(sessionId);
      if (record) {
        record.session.status = "exited";
      }
      this.window.webContents.send(ipc.terminal.exit, { sessionId, exitCode, signal });
      this.sessions.delete(sessionId);
    });

    this.sessions.set(sessionId, { session, pty: child });
    return session;
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) {
      this.sessions.get(sessionId)?.pty.resize(cols, rows);
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

  static defaultShellName(): string {
    return path.basename(process.env.SHELL || os.userInfo().shell || "zsh");
  }
}
