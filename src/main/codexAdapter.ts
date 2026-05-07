import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { BrowserWindow } from "electron";
import { buildCodexExecArgs, type CodexRunCommandOptions } from "../shared/codexCommand";
import { parseCodexLine } from "../shared/codexEvents";
import { ipc } from "../shared/ipc";
import type { CodexEvent, CodexRun } from "../shared/types";

export interface CodexAdapter {
  run(prompt: string, workspace: string, options?: CodexRunCommandOptions): CodexRun;
  cancel(runId: string): void;
}

type ActiveRun = {
  run: CodexRun;
  child: ChildProcessWithoutNullStreams;
  stdoutBuffer: string;
  stderrBuffer: string;
  updateTimer?: ReturnType<typeof setTimeout>;
};

export class CodexCliAdapter implements CodexAdapter {
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(private readonly window: BrowserWindow) {}

  run(prompt: string, workspace: string, options: CodexRunCommandOptions = {}): CodexRun {
    const id = crypto.randomUUID();
    const args = buildCodexExecArgs(prompt, workspace, options);

    const startedAt = new Date().toISOString();
    const run: CodexRun = {
      id,
      workspace,
      prompt,
      status: "running",
      startedAt,
      events: []
    };

    const child = spawn("codex", args, {
      cwd: workspace,
      env: process.env
    });

    const active: ActiveRun = {
      run,
      child,
      stdoutBuffer: "",
      stderrBuffer: ""
    };
    this.activeRuns.set(id, active);

    child.stdout.on("data", (chunk: Buffer) => {
      active.stdoutBuffer = this.consumeLines(active.stdoutBuffer + chunk.toString(), (line) => {
        this.recordEvent(active, parseCodexLine(line));
      });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      active.stderrBuffer = this.consumeLines(active.stderrBuffer + chunk.toString(), (line) => {
        this.recordEvent(active, {
          timestamp: new Date().toISOString(),
          type: "stderr",
          message: line,
          raw: line
        });
      });
    });

    child.on("error", (error) => {
      run.status = "failed";
      run.endedAt = new Date().toISOString();
      this.recordEvent(active, {
        timestamp: new Date().toISOString(),
        type: "error",
        message: error.message,
        raw: { message: error.message }
      });
      this.flushRunUpdate(active);
      this.activeRuns.delete(id);
    });

    child.on("close", (exitCode) => {
      if (active.stdoutBuffer.trim()) {
        this.recordEvent(active, parseCodexLine(active.stdoutBuffer.trim()));
      }
      if (active.stderrBuffer.trim()) {
        this.recordEvent(active, {
          timestamp: new Date().toISOString(),
          type: "stderr",
          message: active.stderrBuffer.trim(),
          raw: active.stderrBuffer.trim()
        });
      }

      run.exitCode = exitCode;
      run.status = run.status === "cancelled" ? "cancelled" : exitCode === 0 ? "completed" : "failed";
      run.endedAt = new Date().toISOString();
      this.flushRunUpdate(active);
      this.activeRuns.delete(id);
    });

    this.sendRunUpdate(run);
    return run;
  }

  cancel(runId: string): void {
    const active = this.activeRuns.get(runId);
    if (!active) {
      return;
    }
    active.run.status = "cancelled";
    active.child.kill("SIGTERM");
    this.flushRunUpdate(active);
  }

  private consumeLines(buffer: string, onLine: (line: string) => void): string {
    const lines = buffer.split(/\r?\n/);
    const remainder = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        onLine(line);
      }
    }
    return remainder;
  }

  private recordEvent(active: ActiveRun, event: CodexEvent): void {
    active.run.events.push(event);
    this.sendCodexEvent(active.run.id, event);
    this.queueRunUpdate(active);
  }

  private queueRunUpdate(active: ActiveRun): void {
    if (active.updateTimer) {
      return;
    }

    active.updateTimer = setTimeout(() => {
      active.updateTimer = undefined;
      this.sendRunUpdate(active.run);
    }, 100);
  }

  private flushRunUpdate(active: ActiveRun): void {
    if (active.updateTimer) {
      clearTimeout(active.updateTimer);
      active.updateTimer = undefined;
    }
    this.sendRunUpdate(active.run);
  }

  private sendRunUpdate(run: CodexRun): void {
    this.send(ipc.codex.update, run);
  }

  private sendCodexEvent(runId: string, event: CodexEvent): void {
    this.send(ipc.codex.event, { runId, event });
  }

  private send(channel: string, payload: unknown): void {
    if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
      try {
        this.window.webContents.send(channel, payload);
      } catch {
        // The renderer can disappear while a Codex child process is still flushing output.
      }
    }
  }
}
