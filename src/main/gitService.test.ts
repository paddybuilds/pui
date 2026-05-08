import { execFile } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitWorkspaceService } from "./gitService";

const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  default: {
    execFile: mockExecFile
  },
  execFile: mockExecFile
}));

const execFileMock = vi.mocked(execFile);

describe("GitWorkspaceService operations", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("commits with a message", async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      (callback as unknown as (error: Error | null, result: { stdout: string; stderr: string }) => void)?.(null, {
        stdout: "committed",
        stderr: ""
      });
      return {} as ReturnType<typeof execFile>;
    });

    const service = new GitWorkspaceService({} as never);
    await expect(service.commit("/repo", "ship it")).resolves.toEqual({
      ok: true,
      stdout: "committed",
      stderr: ""
    });
    expect(execFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/git(?:\.exe)?$/),
      ["-C", "/repo", "commit", "-m", "ship it"],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("pushes the current branch", async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      (callback as unknown as (error: Error | null, result: { stdout: string; stderr: string }) => void)?.(null, {
        stdout: "",
        stderr: "pushed"
      });
      return {} as ReturnType<typeof execFile>;
    });

    const service = new GitWorkspaceService({} as never);
    await expect(service.push("/repo")).resolves.toEqual({
      ok: true,
      stdout: "",
      stderr: "pushed"
    });
    expect(execFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/git(?:\.exe)?$/),
      ["-C", "/repo", "push"],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("loads branch and status files from one coalesced status process", async () => {
    let callback: ((error: Error | null, result: { stdout: string; stderr: string }) => void) | undefined;
    execFileMock.mockImplementation((_command, _args, _options, statusCallback) => {
      callback = statusCallback as typeof callback;
      return {} as ReturnType<typeof execFile>;
    });

    const service = new GitWorkspaceService({} as never);
    const first = service.getStatus("/repo");
    const second = service.getStatus("/repo");

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/git(?:\.exe)?$/),
      ["-C", "/repo", "status", "--porcelain=v1", "--branch"],
      expect.any(Object),
      expect.any(Function)
    );

    callback?.(null, {
      stdout: "## main...origin/main [ahead 1]\n M src/App.tsx\n?? src/new.ts\n",
      stderr: ""
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        workspace: "/repo",
        isRepo: true,
        branch: "main",
        files: [
          { path: "src/App.tsx", indexStatus: " ", workingTreeStatus: "M" },
          { path: "src/new.ts", indexStatus: "?", workingTreeStatus: "?" }
        ]
      },
      {
        workspace: "/repo",
        isRepo: true,
        branch: "main",
        files: [
          { path: "src/App.tsx", indexStatus: " ", workingTreeStatus: "M" },
          { path: "src/new.ts", indexStatus: "?", workingTreeStatus: "?" }
        ]
      }
    ]);
  });

  it("loads commit details with changed file stats", async () => {
    execFileMock.mockImplementation((_command, args, _options, callback) => {
      const gitArgs = args as string[];
      if (gitArgs.includes("--numstat")) {
        (callback as unknown as (error: Error | null, result: { stdout: string; stderr: string }) => void)?.(null, {
          stdout: "12\t3\tsrc/App.tsx\n-\t-\tassets/logo.png\n",
          stderr: ""
        });
        return {} as ReturnType<typeof execFile>;
      }

      (callback as unknown as (error: Error | null, result: { stdout: string; stderr: string }) => void)?.(null, {
        stdout:
          "abcdef123\x1fabcdef1\x1fPaddy\x1fpaddy@example.com\x1f2026-05-07T20:00:00+01:00\x1fShip git panel\x1fBody text",
        stderr: ""
      });
      return {} as ReturnType<typeof execFile>;
    });

    const service = new GitWorkspaceService({} as never);
    await expect(service.getCommitDetails("/repo", "abcdef123")).resolves.toEqual({
      hash: "abcdef123",
      shortHash: "abcdef1",
      author: "Paddy",
      authorEmail: "paddy@example.com",
      date: "2026-05-07T20:00:00+01:00",
      subject: "Ship git panel",
      body: "Body text",
      files: [
        { path: "src/App.tsx", additions: 12, deletions: 3 },
        { path: "assets/logo.png", additions: null, deletions: null }
      ]
    });
  });

  it("loads a file diff for a commit", async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      (callback as unknown as (error: Error | null, result: { stdout: string; stderr: string }) => void)?.(null, {
        stdout: "diff --git a/src/App.tsx b/src/App.tsx\n+changed\n",
        stderr: ""
      });
      return {} as ReturnType<typeof execFile>;
    });

    const service = new GitWorkspaceService({} as never);
    await expect(service.getCommitFileDiff("/repo", "abcdef123", "src/App.tsx")).resolves.toEqual({
      workspace: "/repo",
      hash: "abcdef123",
      file: "src/App.tsx",
      text: "diff --git a/src/App.tsx b/src/App.tsx\n+changed\n"
    });
    expect(execFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/git(?:\.exe)?$/),
      [
        "-C",
        "/repo",
        "show",
        "--first-parent",
        "--format=",
        "--no-ext-diff",
        "--color=never",
        "abcdef123",
        "--",
        "src/App.tsx"
      ],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("truncates very large commit file diffs", async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      (callback as unknown as (error: Error | null, result: { stdout: string; stderr: string }) => void)?.(null, {
        stdout: `${"x".repeat(1_000_050)}\n+changed\n`,
        stderr: ""
      });
      return {} as ReturnType<typeof execFile>;
    });

    const service = new GitWorkspaceService({} as never);
    const diff = await service.getCommitFileDiff("/repo", "abcdef123", "src/App.tsx");

    expect(diff.text).toContain("pui truncated this diff");
    expect(diff.text.length).toBeLessThan(1_000_200);
  });
});
