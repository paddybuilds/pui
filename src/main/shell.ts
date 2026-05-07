import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";

const POSIX_FALLBACK_SHELLS = new Set(["/bin/zsh", "/bin/bash", "/bin/sh", "zsh", "bash", "sh"]);

export type ResolvedShell = {
  command: string;
  args: string[];
  name: string;
};

export type ShellCandidateSource = "environment" | "system" | "wsl" | "custom";

export type ShellCandidate = {
  id: string;
  name: string;
  command: string;
  args: string[];
  source: ShellCandidateSource;
  available: boolean;
};

type ShellDiscoveryOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (filePath: string) => boolean;
  userShell?: string;
};

export function defaultShell(): ResolvedShell {
  if (process.platform === "win32") {
    const command = process.env.PUI_SHELL || "powershell.exe";
    return {
      command,
      args: command.toLowerCase().endsWith("powershell.exe") ? ["-NoLogo"] : [],
      name: command.toLowerCase().endsWith("cmd.exe") ? "cmd" : "PowerShell"
    };
  }

  const command = process.env.SHELL || os.userInfo().shell || "/bin/zsh";
  return {
    command,
    args: [],
    name: path.basename(command)
  };
}

export function resolveProfileShell(command?: string, args: string[] = []): ResolvedShell {
  if (process.platform === "win32" && (!command || POSIX_FALLBACK_SHELLS.has(command))) {
    return defaultShell();
  }

  const resolvedCommand = command || defaultShell().command;
  return {
    command: resolvedCommand,
    args,
    name: path.basename(resolvedCommand)
  };
}

export function listShells(options: ShellDiscoveryOptions = {}): ShellCandidate[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;

  const candidates =
    platform === "win32"
      ? listWindowsShells(env, exists)
      : listPosixShells(env, exists, options.userShell ?? safeUserShell());

  return dedupeShells([
    ...candidates,
    {
      id: "custom",
      name: "Custom",
      command: "",
      args: [],
      source: "custom",
      available: true
    }
  ]);
}

function listWindowsShells(env: NodeJS.ProcessEnv, exists: (filePath: string) => boolean): ShellCandidate[] {
  const candidates: ShellCandidate[] = [];
  const puiShell = env.PUI_SHELL?.trim();

  if (puiShell) {
    candidates.push({
      id: "env-pui-shell",
      name: shellDisplayName(puiShell),
      command: puiShell,
      args: puiShell.toLowerCase().endsWith("powershell.exe") ? ["-NoLogo"] : [],
      source: "environment",
      available: commandAvailable("win32", puiShell, env, exists)
    });
  }

  const systemRoot = env.SystemRoot || "C:\\Windows";
  const programFiles = env.ProgramFiles || "C:\\Program Files";

  candidates.push(
    {
      id: "powershell",
      name: "Windows PowerShell",
      command: "powershell.exe",
      args: ["-NoLogo"],
      source: "system",
      available: commandAvailable("win32", "powershell.exe", env, exists, [
        path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
      ])
    },
    {
      id: "pwsh",
      name: "PowerShell",
      command: "pwsh.exe",
      args: ["-NoLogo"],
      source: "system",
      available: commandAvailable("win32", "pwsh.exe", env, exists, [
        path.win32.join(programFiles, "PowerShell", "7", "pwsh.exe")
      ])
    },
    {
      id: "cmd",
      name: "Command Prompt",
      command: "cmd.exe",
      args: [],
      source: "system",
      available: commandAvailable("win32", "cmd.exe", env, exists, [path.win32.join(systemRoot, "System32", "cmd.exe")])
    },
    {
      id: "wsl",
      name: "WSL",
      command: "wsl.exe",
      args: [],
      source: "wsl",
      available: commandAvailable("win32", "wsl.exe", env, exists, [path.win32.join(systemRoot, "System32", "wsl.exe")])
    }
  );

  return candidates;
}

function listPosixShells(
  env: NodeJS.ProcessEnv,
  exists: (filePath: string) => boolean,
  userShell?: string
): ShellCandidate[] {
  const candidates: ShellCandidate[] = [];
  const envShell = env.SHELL?.trim() || userShell?.trim();

  if (envShell) {
    candidates.push({
      id: `env-${shellId(envShell)}`,
      name: shellDisplayName(envShell),
      command: envShell,
      args: [],
      source: "environment",
      available: commandAvailable("linux", envShell, env, exists)
    });
  }

  for (const shell of ["zsh", "bash", "sh"] as const) {
    const command = resolvePosixCommand(shell, env, exists);
    if (command) {
      candidates.push({
        id: shell,
        name: shell,
        command,
        args: [],
        source: "system",
        available: true
      });
    }
  }

  return candidates;
}

function resolvePosixCommand(
  shell: "zsh" | "bash" | "sh",
  env: NodeJS.ProcessEnv,
  exists: (filePath: string) => boolean
): string | undefined {
  const absoluteCandidates = [`/bin/${shell}`, `/usr/bin/${shell}`, `/usr/local/bin/${shell}`];
  const absoluteCommand = absoluteCandidates.find((candidate) => exists(candidate));

  if (absoluteCommand) {
    return absoluteCommand;
  }

  return commandAvailable("linux", shell, env, exists) ? shell : undefined;
}

function commandAvailable(
  platform: NodeJS.Platform,
  command: string,
  env: NodeJS.ProcessEnv,
  exists: (filePath: string) => boolean,
  knownPaths: string[] = []
): boolean {
  const pathApi = platform === "win32" ? path.win32 : path.posix;

  if (knownPaths.some((candidate) => exists(candidate))) {
    return true;
  }

  if (pathApi.isAbsolute(command)) {
    return exists(command);
  }

  const pathEntries = shellPathEntries(platform, env);
  const commandNames =
    platform === "win32" && !pathApi.extname(command) ? windowsExecutableNames(command, env) : [command];

  return pathEntries.some((entry) => commandNames.some((name) => exists(pathApi.join(entry, name))));
}

function shellPathEntries(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const delimiter = platform === "win32" ? ";" : ":";
  const pathValue = env.PATH || env.Path || "";
  return pathValue.split(delimiter).filter(Boolean);
}

function windowsExecutableNames(command: string, env: NodeJS.ProcessEnv): string[] {
  const extensions = (env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean);

  return extensions.map((extension) => `${command}${extension}`);
}

function shellDisplayName(command: string): string {
  const baseName = path.win32.basename(command).replace(/\.(exe|cmd|bat)$/i, "");
  if (baseName.toLowerCase() === "pwsh") {
    return "PowerShell";
  }
  if (baseName.toLowerCase() === "powershell") {
    return "Windows PowerShell";
  }
  if (baseName.toLowerCase() === "cmd") {
    return "Command Prompt";
  }
  return baseName;
}

function shellId(command: string): string {
  return shellDisplayName(command)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function dedupeShells(candidates: ShellCandidate[]): ShellCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.command.toLowerCase()}\0${candidate.args.join("\0")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function safeUserShell(): string | undefined {
  try {
    return os.userInfo().shell || undefined;
  } catch {
    return undefined;
  }
}
