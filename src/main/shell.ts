import os from "node:os";
import path from "node:path";

const POSIX_FALLBACK_SHELLS = new Set(["/bin/zsh", "/bin/bash", "/bin/sh", "zsh", "bash", "sh"]);

export type ResolvedShell = {
  command: string;
  args: string[];
  name: string;
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
