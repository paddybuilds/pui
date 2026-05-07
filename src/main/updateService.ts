import packageMetadata from "../../package.json";
import type { AppUpdateCheckResult, AppVersionInfo } from "../shared/types";

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

type AppUpdateServiceOptions = {
  getVersion: () => string;
  packageMetadata?: PackageMetadata;
  fetch?: FetchLike;
  now?: () => Date;
};

export class AppUpdateService {
  private readonly metadata: PackageMetadata;
  private readonly fetchLatest: FetchLike | undefined;
  private readonly now: () => Date;

  constructor(private readonly options: AppUpdateServiceOptions) {
    this.metadata = options.packageMetadata ?? packageMetadata;
    this.fetchLatest = options.fetch ?? (typeof fetch === "function" ? (fetch as FetchLike) : undefined);
    this.now = options.now ?? (() => new Date());
  }

  getVersionInfo(): AppVersionInfo {
    const repositoryUrl = repositoryUrlFromMetadata(this.metadata);
    return {
      name: this.metadata.name ?? "pui",
      version: this.options.getVersion(),
      repositoryUrl,
      updateCheckConfigured: Boolean(parseGitHubRepository(repositoryUrl))
    };
  }

  async checkForUpdates(): Promise<AppUpdateCheckResult> {
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

function toGitHubUrl(repository: GitHubRepository): string {
  return `https://github.com/${repository.owner}/${repository.repo}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
