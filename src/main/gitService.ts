import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import { BrowserWindow } from "electron";
import { parseGitStatus } from "../shared/gitStatus";
import { ipc } from "../shared/ipc";
import type {
  GitCommit,
  GitCommitDetails,
  GitCommitFileDiff,
  GitDiff,
  GitOperationResult,
  GitStatus
} from "../shared/types";
import { gitCommand } from "./gitExecutable";

const execFileAsync = promisify(execFile);
const MAX_DIFF_TEXT_BYTES = 1_000_000;

export class GitWorkspaceService {
  private watchers = new Map<string, FSWatcher>();
  private statusRequests = new Map<string, Promise<GitStatus>>();

  constructor(private readonly window: BrowserWindow) {}

  getStatus(workspace: string): Promise<GitStatus> {
    const current = this.statusRequests.get(workspace);
    if (current) {
      return current;
    }

    const request = this.readStatus(workspace).finally(() => {
      if (this.statusRequests.get(workspace) === request) {
        this.statusRequests.delete(workspace);
      }
    });
    this.statusRequests.set(workspace, request);
    return request;
  }

  private async readStatus(workspace: string): Promise<GitStatus> {
    try {
      const statusResult = await this.git(workspace, ["status", "--porcelain=v1", "--branch"]);
      const lines = statusResult.stdout.split("\n");
      const branchLine = lines.find((line) => line.startsWith("## "));
      const statusOutput = lines.filter((line) => line && !line.startsWith("## ")).join("\n");

      return {
        workspace,
        isRepo: true,
        branch: parseStatusBranch(branchLine) || "HEAD",
        files: parseGitStatus(statusOutput)
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
    return { workspace, file, cached, text: limitDiffText(result.stdout) };
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

  async getCommitDetails(workspace: string, hash: string): Promise<GitCommitDetails> {
    const [metadata, numstat] = await Promise.all([
      this.git(workspace, [
        "show",
        "-s",
        "--date=iso-strict",
        "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s%x1f%b",
        hash
      ]),
      this.git(workspace, ["show", "--format=", "--numstat", "--no-renames", hash])
    ]);
    const [fullHash, shortHash, author, authorEmail, date, subject, ...bodyParts] = metadata.stdout.split("\x1f");

    return {
      hash: fullHash,
      shortHash,
      author,
      authorEmail,
      date,
      subject,
      body: bodyParts.join("\x1f").trim(),
      files: parseCommitFiles(numstat.stdout)
    };
  }

  async getCommitFileDiff(workspace: string, hash: string, file: string): Promise<GitCommitFileDiff> {
    const result = await this.git(workspace, [
      "show",
      "--first-parent",
      "--format=",
      "--no-ext-diff",
      "--color=never",
      hash,
      "--",
      file
    ]);
    return { workspace, hash, file, text: limitDiffText(result.stdout) };
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
      status.files.filter((file) => file.indexStatus === "?" && file.workingTreeStatus === "?").map((file) => file.path)
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
    for (const [watchedWorkspace, watcher] of this.watchers) {
      if (watchedWorkspace !== workspace) {
        void watcher.close();
        this.watchers.delete(watchedWorkspace);
      }
    }

    if (this.watchers.has(workspace)) {
      return;
    }

    const watcher = chokidar.watch(workspace, {
      ignored: /(^|[/\\])(\.git|node_modules|dist|out|build|release|\.next|coverage|\.turbo)([/\\]|$)/,
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

  unwatch(workspace: string): void {
    const watcher = this.watchers.get(workspace);
    if (!watcher) {
      return;
    }
    this.watchers.delete(workspace);
    void watcher.close();
  }

  async close(): Promise<void> {
    await Promise.all(Array.from(this.watchers.values(), (watcher) => watcher.close()));
    this.watchers.clear();
  }

  private async git(workspace: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    const result = await execFileAsync(gitCommand(), ["-C", workspace, ...args], {
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

function parseCommitFiles(output: string): GitCommitDetails["files"] {
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [additions, deletions, ...pathParts] = line.split("\t");
      return {
        path: pathParts.join("\t"),
        additions: additions === "-" ? null : Number(additions),
        deletions: deletions === "-" ? null : Number(deletions)
      };
    });
}

function parseStatusBranch(line: string | undefined): string | undefined {
  if (!line) {
    return undefined;
  }

  const branch = line
    .slice(3)
    .replace(/\s+\[.*\]$/, "")
    .split("...")[0]
    ?.trim();
  return branch || undefined;
}

function limitDiffText(text: string): string {
  if (text.length <= MAX_DIFF_TEXT_BYTES) {
    return text;
  }

  return `${text.slice(0, MAX_DIFF_TEXT_BYTES)}\n\n[pui truncated this diff after ${MAX_DIFF_TEXT_BYTES} characters for performance]\n`;
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
