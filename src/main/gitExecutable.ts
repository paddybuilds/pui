import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

let cachedGitCommand: string | undefined;

export function gitCommand(): string {
  if (cachedGitCommand) {
    return cachedGitCommand;
  }

  cachedGitCommand = process.env.PUI_GIT || resolveWindowsGitCommand() || "git";
  return cachedGitCommand;
}

function resolveWindowsGitCommand(): string | undefined {
  if (process.platform !== "win32") {
    return undefined;
  }

  const candidates = [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Git", "cmd", "git.exe") : undefined,
    process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Git", "cmd", "git.exe") : undefined,
    ...githubDesktopGitCandidates()
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate));
}

function githubDesktopGitCandidates(): string[] {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return [];
  }

  const desktopDir = path.join(localAppData, "GitHubDesktop");
  try {
    return readdirSync(desktopDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("app-"))
      .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))
      .map((entry) => path.join(desktopDir, entry.name, "resources", "app", "git", "cmd", "git.exe"));
  } catch {
    return [];
  }
}
