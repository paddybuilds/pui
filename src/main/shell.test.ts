import { describe, expect, it } from "vitest";
import { listShells } from "./shell";

function existsFrom(paths: string[]): (filePath: string) => boolean {
  const normalized = new Set(paths.map((filePath) => filePath.toLowerCase()));
  return (filePath) => normalized.has(filePath.toLowerCase());
}

describe("listShells", () => {
  it("returns deterministic Windows shell candidates with availability", () => {
    const shells = listShells({
      platform: "win32",
      env: {
        SystemRoot: "C:\\Windows",
        ProgramFiles: "C:\\Program Files",
        PATH: "C:\\Tools",
        PATHEXT: ".EXE;.CMD",
        PUI_SHELL: "C:\\Tools\\nu.exe"
      },
      exists: existsFrom([
        "C:\\Tools\\nu.exe",
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        "C:\\Windows\\System32\\cmd.exe"
      ])
    });

    expect(shells).toEqual([
      {
        id: "env-pui-shell",
        name: "nu",
        command: "C:\\Tools\\nu.exe",
        args: [],
        source: "environment",
        available: true
      },
      {
        id: "powershell",
        name: "Windows PowerShell",
        command: "powershell.exe",
        args: ["-NoLogo"],
        source: "system",
        available: true
      },
      {
        id: "pwsh",
        name: "PowerShell",
        command: "pwsh.exe",
        args: ["-NoLogo"],
        source: "system",
        available: true
      },
      {
        id: "cmd",
        name: "Command Prompt",
        command: "cmd.exe",
        args: [],
        source: "system",
        available: true
      },
      {
        id: "wsl",
        name: "WSL",
        command: "wsl.exe",
        args: [],
        source: "wsl",
        available: false
      },
      {
        id: "custom",
        name: "Custom",
        command: "",
        args: [],
        source: "custom",
        available: true
      }
    ]);
  });

  it("returns present POSIX shells plus SHELL and custom entries", () => {
    const shells = listShells({
      platform: "darwin",
      env: {
        PATH: "/usr/local/bin:/bin:/usr/bin",
        SHELL: "/usr/local/bin/fish"
      },
      exists: existsFrom(["/usr/local/bin/fish", "/usr/bin/zsh", "/bin/bash", "/bin/sh"])
    });

    expect(shells).toEqual([
      {
        id: "env-fish",
        name: "fish",
        command: "/usr/local/bin/fish",
        args: [],
        source: "environment",
        available: true
      },
      {
        id: "zsh",
        name: "zsh",
        command: "/usr/bin/zsh",
        args: [],
        source: "system",
        available: true
      },
      {
        id: "bash",
        name: "bash",
        command: "/bin/bash",
        args: [],
        source: "system",
        available: true
      },
      {
        id: "sh",
        name: "sh",
        command: "/bin/sh",
        args: [],
        source: "system",
        available: true
      },
      {
        id: "custom",
        name: "Custom",
        command: "",
        args: [],
        source: "custom",
        available: true
      }
    ]);
  });
});
