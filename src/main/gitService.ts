import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import { BrowserWindow } from "electron";
import { parseGitStatus } from "../shared/gitStatus";
import { ipc } from "../shared/ipc";
import type { GitCommit, GitDiff, GitOperationResult, GitStatus } from "../shared/types";

const execFileAsync = promisify(execFile);

export class GitWorkspaceService {
  private watchers = new Map<string, FSWatcher>();

  constructor(private readonly window: BrowserWindow) {}

  async getStatus(workspace: string): Promise<GitStatus> {
    try {
      const [branchResult, statusResult] = await Promise.all([
        this.git(workspace, ["branch", "--show-current"]),
        this.git(workspace, ["status", "--porcelain=v1"])
      ]);

      return {
        workspace,
        isRepo: true,
        branch: branchResult.stdout.trim() || "HEAD",
        files: parseGitStatus(statusResult.stdout)
      };
    } catch (error) {
      return {
        workspace,
        isRepo: false,
        files: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getDiff(workspace: string, file?: string, cached = false): Promise<GitDiff> {
    const args = ["diff", "--no-ext-diff", "--color=never"];
    if (cached) {
      args.push("--cached");
    }
    if (file) {
      args.push("--", file);
    }
    const result = await this.git(workspace, args);
    return { workspace, file, cached, text: result.stdout };
  }

  async getRecentCommits(workspace: string, limit = 16): Promise<GitCommit[]> {
    const safeLimit = Math.min(50, Math.max(1, Math.round(limit)));
    let result: { stdout: string };
    try {
      result = await this.git(workspace, [
        "log",
        `-${safeLimit}`,
        "--date=short",
        "--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s"
      ]);
    } catch {
      return [];
    }

    return result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, author, date, subject] = line.split("\x1f");
        return {
          hash,
          shortHash,
          author,
          date,
          subject
        };
      });
  }

  async stage(workspace: string, paths: string[]): Promise<GitStatus> {
    await this.git(workspace, ["add", "--", ...paths]);
    return this.getStatus(workspace);
  }

  async unstage(workspace: string, paths: string[]): Promise<GitStatus> {
    await this.git(workspace, ["restore", "--staged", "--", ...paths]);
    return this.getStatus(workspace);
  }

  async discard(workspace: string, paths: string[]): Promise<GitStatus> {
    const status = await this.getStatus(workspace);
    const untracked = new Set(
      status.files
        .filter((file) => file.indexStatus === "?" && file.workingTreeStatus === "?")
        .map((file) => file.path)
    );
    const untrackedPaths = paths.filter((path) => untracked.has(path));
    const trackedPaths = paths.filter((path) => !untracked.has(path));

    if (trackedPaths.length > 0) {
      await this.git(workspace, ["restore", "--source=HEAD", "--worktree", "--", ...trackedPaths]);
    }
    if (untrackedPaths.length > 0) {
      await this.git(workspace, ["clean", "-f", "--", ...untrackedPaths]);
    }
    return this.getStatus(workspace);
  }

  async commit(workspace: string, message: string): Promise<GitOperationResult> {
    return this.gitOperation(workspace, ["commit", "-m", message]);
  }

  async push(workspace: string): Promise<GitOperationResult> {
    return this.gitOperation(workspace, ["push"]);
  }

  watch(workspace: string): void {
    if (this.watchers.has(workspace)) {
      return;
    }

    const watcher = chokidar.watch(workspace, {
      ignored: /(^|[/\\])(\.git|node_modules|dist|out)([/\\]|$)/,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 40
      }
    });

    const notify = debounce(() => {
      this.window.webContents.send(ipc.git.changed, { workspace });
    }, 250);

    watcher.on("add", notify).on("change", notify).on("unlink", notify);
    this.watchers.set(workspace, watcher);
  }

  async close(): Promise<void> {
    await Promise.all(Array.from(this.watchers.values(), (watcher) => watcher.close()));
    this.watchers.clear();
  }

  private async git(workspace: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    const result = await execFileAsync("git", ["-C", workspace, ...args], {
      maxBuffer: 1024 * 1024 * 12
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  private async gitOperation(workspace: string, args: string[]): Promise<GitOperationResult> {
    try {
      const result = await this.git(workspace, args);
      return { ok: true, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; message?: string };
      return {
        ok: false,
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? "",
        error: execError.stderr || execError.message || String(error)
      };
    }
  }
}

function debounce(callback: () => void, delay: number): () => void {
  let timeout: NodeJS.Timeout | undefined;
  return () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(callback, delay);
  };
}
