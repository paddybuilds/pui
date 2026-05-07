import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronViteBin = path.join(root, "node_modules", "electron-vite", "bin", "electron-vite.js");
const electronViteCommand = process.execPath;
const electronViteArgs = [electronViteBin, "dev"];
const children = new Set();
let shuttingDown = false;

const bridge = start("terminal bridge", process.execPath, [path.join(root, "scripts", "terminal-bridge.mjs")]);
const electronVite = start("electron-vite", electronViteCommand, electronViteArgs);

function start(label, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: process.env
  });

  children.add(child);
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);

  child.on("error", (error) => {
    console.error(`[pui-dev] ${label} failed to start: ${error.message}`);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (label === "terminal bridge" && code === 0 && !signal) {
      return;
    }
    if (!shuttingDown) {
      if (signal) {
        console.error(`[pui-dev] ${label} exited with signal ${signal}`);
      }
      shutdown(code ?? (signal ? 1 : 0));
    }
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  process.exitCode = exitCode;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("exit", () => {
  bridge.kill();
  electronVite.kill();
});
