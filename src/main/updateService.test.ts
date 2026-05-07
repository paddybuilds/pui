import { describe, expect, it, vi } from "vitest";
import {
  AppUpdateService,
  compareReleaseVersions,
  normalizeCommitSha,
  parseGitHubRepository,
  repositoryUrlFromMetadata
} from "./updateService";

const now = () => new Date("2026-05-07T12:00:00.000Z");

function createUpdater() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(async () => ({ updateInfo: { version: "0.2.0", releaseNotes: "New build" } })),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return undefined;
    }),
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    }
  };
}

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
  it("falls back to GitHub release checks when installer updates are unsupported", async () => {
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
      now,
      platform: "darwin",
      isPackaged: true,
      macAutoUpdateEnabled: false
    });

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: "available",
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      releaseUrl: "https://github.com/example/pui/releases/tag/v0.2.0",
      installReady: false,
      installSupported: false
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

  it("checks and downloads installer updates on supported packaged builds", async () => {
    const updater = createUpdater();
    const statuses: string[] = [];
    const service = new AppUpdateService({
      getVersion: () => "0.1.0",
      packageMetadata: { name: "pui", repository: "https://github.com/example/pui" },
      now,
      platform: "win32",
      isPackaged: true,
      updater,
      onStatus: (status) => statuses.push(status.status)
    });

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: "available",
      latestVersion: "0.2.0",
      installSupported: true
    });

    const downloadPromise = service.downloadUpdate();
    updater.emit("download-progress", { percent: 55, transferred: 55, total: 100, bytesPerSecond: 200 });
    updater.emit("update-downloaded", { version: "0.2.0", releaseNotes: "New build" });
    await expect(downloadPromise).resolves.toMatchObject({
      status: "downloaded",
      installReady: true,
      progress: undefined
    });
    expect(updater.downloadUpdate).toHaveBeenCalled();
    expect(statuses).toContain("downloading");
    expect(statuses).toContain("downloaded");
  });

  it("installs only after an update is downloaded", async () => {
    const updater = createUpdater();
    const service = new AppUpdateService({
      getVersion: () => "0.1.0",
      packageMetadata: { name: "pui", repository: "https://github.com/example/pui" },
      now,
      platform: "win32",
      isPackaged: true,
      updater
    });

    expect(service.installDownloadedUpdate()).toMatchObject({
      status: "error",
      installReady: false
    });

    await service.checkForUpdates();
    const downloadPromise = service.downloadUpdate();
    updater.emit("update-downloaded", { version: "0.2.0" });
    await downloadPromise;
    service.installDownloadedUpdate();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});
