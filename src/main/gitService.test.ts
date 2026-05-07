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
    expect(execFileMock).toHaveBeenCalledWith("git", ["-C", "/repo", "commit", "-m", "ship it"], expect.any(Object), expect.any(Function));
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
    expect(execFileMock).toHaveBeenCalledWith("git", ["-C", "/repo", "push"], expect.any(Object), expect.any(Function));
  });
});
