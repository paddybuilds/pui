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
        this.recordEvent(run, parseCodexLine(line));
      });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      active.stderrBuffer = this.consumeLines(active.stderrBuffer + chunk.toString(), (line) => {
        this.recordEvent(run, {
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
      this.recordEvent(run, {
        timestamp: new Date().toISOString(),
        type: "error",
        message: error.message,
        raw: { message: error.message }
      });
      this.window.webContents.send(ipc.codex.update, run);
      this.activeRuns.delete(id);
    });

    child.on("close", (exitCode) => {
      if (active.stdoutBuffer.trim()) {
        this.recordEvent(run, parseCodexLine(active.stdoutBuffer.trim()));
      }
      if (active.stderrBuffer.trim()) {
        this.recordEvent(run, {
          timestamp: new Date().toISOString(),
          type: "stderr",
          message: active.stderrBuffer.trim(),
          raw: active.stderrBuffer.trim()
        });
      }

      run.exitCode = exitCode;
      run.status = run.status === "cancelled" ? "cancelled" : exitCode === 0 ? "completed" : "failed";
      run.endedAt = new Date().toISOString();
      this.window.webContents.send(ipc.codex.update, run);
      this.activeRuns.delete(id);
    });

    this.window.webContents.send(ipc.codex.update, run);
    return run;
  }

  cancel(runId: string): void {
    const active = this.activeRuns.get(runId);
    if (!active) {
      return;
    }
    active.run.status = "cancelled";
    active.child.kill("SIGTERM");
    this.window.webContents.send(ipc.codex.update, active.run);
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

  private recordEvent(run: CodexRun, event: CodexEvent): void {
    run.events.push(event);
    this.window.webContents.send(ipc.codex.event, { runId: run.id, event });
    this.window.webContents.send(ipc.codex.update, run);
  }
}
