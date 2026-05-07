import packageMetadata from "../../package.json";
import { execFileSync } from "node:child_process";
import type { AppUpdateCheckResult, AppUpdateProgress, AppUpdateSnapshot, AppVersionInfo } from "../shared/types";
import { gitCommand } from "./gitExecutable";

type PackageMetadata = {
  name?: string;
  repository?: string | { url?: string };
  homepage?: string;
};

type GitHubRepository = {
  owner: string;
  repo: string;
};

type FetchResponse = Pick<Response, "ok" | "status" | "json">;
type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponse>;

type ReleaseNoteInfo = {
  note?: string | null;
};

type UpdateInfoLike = {
  version?: string;
  releaseName?: string | null;
  releaseNotes?: string | ReleaseNoteInfo[] | null;
  releaseDate?: string;
  files?: Array<{ url?: string }>;
};

type UpdateCheckResultLike = {
  updateInfo?: UpdateInfoLike;
};

type UpdaterEventName =
  | "checking-for-update"
  | "update-available"
  | "update-not-available"
  | "download-progress"
  | "update-downloaded"
  | "error";

export type AppUpdaterAdapter = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates: () => Promise<UpdateCheckResultLike | null>;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  on: (event: UpdaterEventName, listener: (...args: unknown[]) => void) => unknown;
};

type AppUpdateServiceOptions = {
  getVersion: () => string;
  getCommitSha?: () => string | undefined;
  packageMetadata?: PackageMetadata;
  fetch?: FetchLike;
  now?: () => Date;
  platform?: NodeJS.Platform;
  isPackaged?: boolean;
  macAutoUpdateEnabled?: boolean;
  updater?: AppUpdaterAdapter;
  onStatus?: (status: AppUpdateSnapshot) => void;
};

export class AppUpdateService {
  private readonly metadata: PackageMetadata;
  private readonly fetchLatest: FetchLike | undefined;
  private readonly now: () => Date;
  private readonly platform: NodeJS.Platform;
  private readonly isPackaged: boolean;
  private readonly macAutoUpdateEnabled: boolean;
  private readonly updater: AppUpdaterAdapter | undefined;
  private readonly versionInfo: AppVersionInfo;
  private snapshot: AppUpdateSnapshot;

  constructor(private readonly options: AppUpdateServiceOptions) {
    this.metadata = options.packageMetadata ?? packageMetadata;
    this.fetchLatest = options.fetch ?? (typeof fetch === "function" ? (fetch as FetchLike) : undefined);
    this.now = options.now ?? (() => new Date());
    this.platform = options.platform ?? process.platform;
    this.isPackaged = options.isPackaged ?? false;
    this.macAutoUpdateEnabled = options.macAutoUpdateEnabled ?? false;
    this.updater = options.updater;
    this.versionInfo = this.computeVersionInfo();
    this.snapshot = this.createSnapshot({
      status: "idle",
      message: "Ready to check for updates."
    });
    this.configureUpdater();
  }

  getVersionInfo(): AppVersionInfo {
    return this.versionInfo;
  }

  private computeVersionInfo(): AppVersionInfo {
    const repositoryUrl = repositoryUrlFromMetadata(this.metadata);
    const commitSha = normalizeCommitSha(this.options.getCommitSha?.() ?? currentGitCommitSha());
    return {
      name: this.metadata.name ?? "pui",
      version: this.options.getVersion(),
      commitSha,
      commitShortSha: commitSha?.slice(0, 7),
      repositoryUrl,
      updateCheckConfigured: Boolean(parseGitHubRepository(repositoryUrl))
    };
  }

  getStatus(): AppUpdateSnapshot {
    return this.snapshot;
  }

  async checkForUpdates(): Promise<AppUpdateSnapshot> {
    this.setSnapshot({
      status: "checking",
      checkedAt: this.now().toISOString(),
      message: "Checking for updates.",
      installReady: false,
      progress: undefined
    });

    if (this.canInstallUpdates()) {
      try {
        const result = await this.updater?.checkForUpdates();
        const info = result?.updateInfo;
        if (info?.version) {
          return this.setSnapshot(this.snapshotFromUpdateInfo("available", info, `Pui ${info.version} is available.`));
        }
      } catch (error) {
        return this.setSnapshot({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          checkedAt: this.now().toISOString(),
          installReady: false
        });
      }
    }

    return this.setSnapshot(this.snapshotFromReleaseCheck(await this.checkGitHubRelease()));
  }

  async downloadUpdate(): Promise<AppUpdateSnapshot> {
    if (!this.canInstallUpdates()) {
      return this.setSnapshot({
        status: "error",
        message: this.unsupportedInstallMessage(),
        installReady: false
      });
    }

    if (this.snapshot.status !== "available") {
      return this.setSnapshot({
        status: "error",
        message: "No update is ready to download.",
        installReady: false
      });
    }

    this.setSnapshot({
      status: "downloading",
      message: `Downloading Pui ${this.snapshot.latestVersion ?? "update"}.`,
      installReady: false,
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 }
    });

    try {
      await this.updater?.downloadUpdate();
      return this.snapshot;
    } catch (error) {
      return this.setSnapshot({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        installReady: false
      });
    }
  }

  installDownloadedUpdate(): AppUpdateSnapshot {
    if (!this.canInstallUpdates()) {
      return this.setSnapshot({
        status: "error",
        message: this.unsupportedInstallMessage(),
        installReady: false
      });
    }

    if (!this.snapshot.installReady) {
      return this.setSnapshot({
        status: "error",
        message: "No downloaded update is ready to install.",
        installReady: false
      });
    }

    this.updater?.quitAndInstall(false, true);
    return this.snapshot;
  }

  private configureUpdater(): void {
    if (!this.updater) {
      return;
    }

    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;

    this.updater.on("checking-for-update", () => {
      this.setSnapshot({ status: "checking", message: "Checking for updates.", installReady: false });
    });
    this.updater.on("update-available", (info) => {
      this.setSnapshot(this.snapshotFromUpdateInfo("available", info as UpdateInfoLike, "Update available."));
    });
    this.updater.on("update-not-available", () => {
      this.setSnapshot({ status: "not-available", message: "Pui is up to date.", installReady: false });
    });
    this.updater.on("download-progress", (progress) => {
      this.setSnapshot({
        status: "downloading",
        message: `Downloading Pui ${this.snapshot.latestVersion ?? "update"}.`,
        progress: normalizeProgress(progress),
        installReady: false
      });
    });
    this.updater.on("update-downloaded", (info) => {
      this.setSnapshot({
        ...this.snapshotFromUpdateInfo("downloaded", info as UpdateInfoLike, "Update downloaded."),
        installReady: true
      });
    });
    this.updater.on("error", (error) => {
      this.setSnapshot({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        installReady: false
      });
    });
  }

  private canInstallUpdates(): boolean {
    if (!this.updater || !this.isPackaged) {
      return false;
    }

    if (this.platform === "win32") {
      return true;
    }

    return this.platform === "darwin" && this.macAutoUpdateEnabled;
  }

  private unsupportedInstallMessage(): string {
    if (this.platform === "darwin" && !this.macAutoUpdateEnabled) {
      return "In-app installation is disabled for unsigned macOS builds. Download the release from GitHub.";
    }
    if (!this.isPackaged) {
      return "In-app installation is only available in packaged builds.";
    }
    return "In-app installation is not available on this platform.";
  }

  private async checkGitHubRelease(): Promise<AppUpdateCheckResult> {
    const versionInfo = this.getVersionInfo();
    const checkedAt = this.now().toISOString();
    const repository = parseGitHubRepository(versionInfo.repositoryUrl);

    if (!repository) {
      return {
        status: "unavailable",
        currentVersion: versionInfo.version,
        checkedAt,
        message: "Update checks are unavailable because this build does not include GitHub release metadata.",
        repositoryUrl: versionInfo.repositoryUrl
      };
    }

    if (!this.fetchLatest) {
      return {
        status: "unavailable",
        currentVersion: versionInfo.version,
        checkedAt,
        message: "Update checks are unavailable in this runtime.",
        repositoryUrl: versionInfo.repositoryUrl
      };
    }

    const releaseUrl = `https://api.github.com/repos/${repository.owner}/${repository.repo}/releases/latest`;

    try {
      const response = await this.fetchLatest(releaseUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `${versionInfo.name}/${versionInfo.version}`
        }
      });

      if (response.status === 404) {
        return {
          status: "unavailable",
          currentVersion: versionInfo.version,
          checkedAt,
          message: "No GitHub release metadata is available for this build.",
          repositoryUrl: versionInfo.repositoryUrl
        };
      }

      if (!response.ok) {
        return {
          status: "error",
          currentVersion: versionInfo.version,
          checkedAt,
          message: `GitHub release check failed with HTTP ${response.status}.`,
          repositoryUrl: versionInfo.repositoryUrl
        };
      }

      const payload = (await response.json()) as unknown;
      const latestVersion = releaseVersionFromPayload(payload);

      if (!latestVersion) {
        return {
          status: "unavailable",
          currentVersion: versionInfo.version,
          checkedAt,
          message: "The latest GitHub release did not include a version tag.",
          repositoryUrl: versionInfo.repositoryUrl
        };
      }

      const releasePageUrl = releasePageUrlFromPayload(payload);
      const comparison = compareReleaseVersions(versionInfo.version, latestVersion);
      const updateAvailable = comparison < 0;

      return {
        status: updateAvailable ? "update-available" : "up-to-date",
        currentVersion: versionInfo.version,
        latestVersion,
        checkedAt,
        releaseUrl: releasePageUrl,
        repositoryUrl: versionInfo.repositoryUrl,
        message: updateAvailable ? `Pui ${latestVersion} is available.` : "Pui is up to date."
      };
    } catch (error) {
      return {
        status: "error",
        currentVersion: versionInfo.version,
        checkedAt,
        message: error instanceof Error ? error.message : String(error),
        repositoryUrl: versionInfo.repositoryUrl
      };
    }
  }

  private snapshotFromReleaseCheck(result: AppUpdateCheckResult): AppUpdateSnapshot {
    const updateAvailable = result.status === "update-available";
    const status = updateAvailable ? "available" : result.status === "error" ? "error" : "not-available";
    return this.createSnapshot({
      status,
      checkedAt: result.checkedAt,
      latestVersion: result.latestVersion,
      releaseUrl: result.releaseUrl,
      repositoryUrl: result.repositoryUrl,
      message:
        updateAvailable && !this.canInstallUpdates()
          ? `${result.message} ${this.unsupportedInstallMessage()}`
          : result.message,
      installReady: false
    });
  }

  private snapshotFromUpdateInfo(
    status: AppUpdateSnapshot["status"],
    info: UpdateInfoLike,
    fallbackMessage: string
  ): AppUpdateSnapshot {
    const latestVersion = info.version;
    return this.createSnapshot({
      status,
      latestVersion,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      message: latestVersion
        ? `Pui ${latestVersion} ${status === "downloaded" ? "is ready to install." : "is available."}`
        : fallbackMessage,
      installReady: status === "downloaded"
    });
  }

  private createSnapshot(partial: Partial<AppUpdateSnapshot>): AppUpdateSnapshot {
    const versionInfo = this.getVersionInfo();
    const nextStatus = partial.status ?? this.snapshot?.status ?? "idle";
    const preserveReleaseContext = nextStatus !== "idle" && nextStatus !== "checking" && nextStatus !== "not-available";
    return {
      status: nextStatus,
      currentVersion: versionInfo.version,
      message: partial.message ?? this.snapshot?.message ?? "",
      installReady: partial.installReady ?? this.snapshot?.installReady ?? false,
      installSupported: this.canInstallUpdates(),
      checkedAt: partial.checkedAt ?? this.snapshot?.checkedAt,
      latestVersion: partial.latestVersion ?? (preserveReleaseContext ? this.snapshot?.latestVersion : undefined),
      releaseUrl: partial.releaseUrl ?? (preserveReleaseContext ? this.snapshot?.releaseUrl : undefined),
      repositoryUrl: partial.repositoryUrl ?? this.snapshot?.repositoryUrl ?? versionInfo.repositoryUrl,
      releaseNotes: partial.releaseNotes ?? this.snapshot?.releaseNotes,
      progress: partial.progress
    };
  }

  private setSnapshot(partial: Partial<AppUpdateSnapshot> | AppUpdateSnapshot): AppUpdateSnapshot {
    this.snapshot = this.createSnapshot(partial);
    this.options.onStatus?.(this.snapshot);
    return this.snapshot;
  }
}

export function repositoryUrlFromMetadata(metadata: PackageMetadata): string | undefined {
  const repositoryValue = typeof metadata.repository === "string" ? metadata.repository : metadata.repository?.url;
  const repository = parseGitHubRepository(repositoryValue);
  if (repository) {
    return toGitHubUrl(repository);
  }

  const homepage = parseGitHubRepository(metadata.homepage);
  return homepage ? toGitHubUrl(homepage) : undefined;
}

export function parseGitHubRepository(value: string | undefined): GitHubRepository | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const withoutPrefix = trimmed.replace(/^git\+/, "");
  const sshMatch = withoutPrefix.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?(?:[#?].*)?$/i);
  const urlMatch = withoutPrefix.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
  const match = sshMatch ?? urlMatch;
  if (!match) {
    return undefined;
  }

  const owner = match[1]?.trim();
  const repo = match[2]?.trim().replace(/\.git$/i, "");
  return owner && repo ? { owner, repo } : undefined;
}

export function releaseVersionFromPayload(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const tagName = payload.tag_name;
  const releaseName = payload.name;
  return normalizeReleaseVersion(
    typeof tagName === "string" ? tagName : typeof releaseName === "string" ? releaseName : ""
  );
}

export function compareReleaseVersions(currentVersion: string, latestVersion: string): number {
  const current = numericVersionParts(currentVersion);
  const latest = numericVersionParts(latestVersion);

  if (!current || !latest) {
    return currentVersion.localeCompare(latestVersion);
  }

  const length = Math.max(current.length, latest.length);
  for (let index = 0; index < length; index += 1) {
    const currentPart = current[index] ?? 0;
    const latestPart = latest[index] ?? 0;
    if (currentPart !== latestPart) {
      return currentPart < latestPart ? -1 : 1;
    }
  }

  return 0;
}

export function normalizeCommitSha(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return /^[a-f0-9]{7,40}$/i.test(normalized) ? normalized : undefined;
}

function currentGitCommitSha(): string | undefined {
  const envCommit = normalizeCommitSha(process.env.PUI_COMMIT_SHA ?? process.env.GITHUB_SHA);
  if (envCommit) {
    return envCommit;
  }

  try {
    return normalizeCommitSha(
      execFileSync(gitCommand(), ["rev-parse", "HEAD"], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      })
    );
  } catch {
    return undefined;
  }
}

function releasePageUrlFromPayload(payload: unknown): string | undefined {
  if (!isRecord(payload) || typeof payload.html_url !== "string") {
    return undefined;
  }
  return payload.html_url;
}

function normalizeReleaseVersion(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^v(?=\d)/i, "");
}

function numericVersionParts(value: string): number[] | undefined {
  const normalized = normalizeReleaseVersion(value);
  if (!normalized) {
    return undefined;
  }

  const core = normalized.split(/[+-]/)[0] ?? "";
  const parts = core.split(".").map((part) => Number(part));
  return parts.length > 0 && parts.every((part) => Number.isInteger(part) && part >= 0) ? parts : undefined;
}

function normalizeReleaseNotes(value: UpdateInfoLike["releaseNotes"]): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => item.note?.trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return undefined;
}

function normalizeProgress(value: unknown): AppUpdateProgress {
  const record = isRecord(value) ? value : {};
  return {
    percent: numberFromRecord(record, "percent"),
    transferred: numberFromRecord(record, "transferred"),
    total: numberFromRecord(record, "total"),
    bytesPerSecond: numberFromRecord(record, "bytesPerSecond")
  };
}

function numberFromRecord(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toGitHubUrl(repository: GitHubRepository): string {
  return `https://github.com/${repository.owner}/${repository.repo}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
