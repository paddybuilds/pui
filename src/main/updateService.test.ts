import { describe, expect, it, vi } from "vitest";
import {
  AppUpdateService,
  compareReleaseVersions,
  normalizeCommitSha,
  parseGitHubRepository,
  repositoryUrlFromMetadata
} from "./updateService";

const now = () => new Date("2026-05-07T12:00:00.000Z");

describe("update service helpers", () => {
  it("normalizes GitHub repository metadata", () => {
    expect(repositoryUrlFromMetadata({ repository: { url: "git+https://github.com/example/pui.git" } })).toBe(
      "https://github.com/example/pui"
    );
    expect(repositoryUrlFromMetadata({ homepage: "https://github.com/example/pui#readme" })).toBe(
      "https://github.com/example/pui"
    );
    expect(parseGitHubRepository("git@github.com:example/pui.git")).toEqual({ owner: "example", repo: "pui" });
  });

  it("compares simple release versions", () => {
    expect(compareReleaseVersions("0.1.0", "v0.2.0")).toBe(-1);
    expect(compareReleaseVersions("1.0.0", "1.0")).toBe(0);
    expect(compareReleaseVersions("2.0.0", "1.9.9")).toBe(1);
  });

  it("normalizes commit hashes for display", () => {
    expect(normalizeCommitSha(" 3c127fdaadd9867414b3179028cb3edb8434196b\n")).toBe(
      "3c127fdaadd9867414b3179028cb3edb8434196b"
    );
    expect(normalizeCommitSha("3c127fd")).toBe("3c127fd");
    expect(normalizeCommitSha("not-a-commit")).toBeUndefined();
  });
});

describe("AppUpdateService", () => {
  it("returns an unavailable status when release metadata is not configured", async () => {
    const service = new AppUpdateService({
      getVersion: () => "0.1.0",
      getCommitSha: () => "3c127fdaadd9867414b3179028cb3edb8434196b",
      packageMetadata: { name: "pui" },
      now
    });

    expect(service.getVersionInfo()).toMatchObject({
      version: "0.1.0",
      commitSha: "3c127fdaadd9867414b3179028cb3edb8434196b",
      commitShortSha: "3c127fd"
    });
    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: "unavailable",
      currentVersion: "0.1.0",
      checkedAt: "2026-05-07T12:00:00.000Z"
    });
  });

  it("checks the latest GitHub release when repository metadata is configured", async () => {
    const fetchLatest = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "v0.2.0",
        html_url: "https://github.com/example/pui/releases/tag/v0.2.0"
      })
    }));
    const service = new AppUpdateService({
      getVersion: () => "0.1.0",
      packageMetadata: { name: "pui", repository: "https://github.com/example/pui" },
      fetch: fetchLatest,
      now
    });

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: "update-available",
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      releaseUrl: "https://github.com/example/pui/releases/tag/v0.2.0"
    });
    expect(fetchLatest).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/pui/releases/latest",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/vnd.github+json",
          "User-Agent": "pui/0.1.0"
        })
      })
    );
  });
});
