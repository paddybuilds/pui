import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const dockerCommand = process.platform === "win32" ? "docker.exe" : "docker";

const composeCandidates = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

const explicitComposeFile = process.env.PUI_DOCKER_COMPOSE_FILE;
const composeFile = explicitComposeFile
  ? path.resolve(root, explicitComposeFile)
  : composeCandidates.map((candidate) => path.join(root, candidate)).find((candidate) => existsSync(candidate));

const webCommand = process.env.PUI_WEB_COMMAND ?? "dev";

await run("Install dependencies", npmCommand, ["install"]);
await run("Rebuild native modules", npmCommand, ["run", "rebuild:native"]);
await run("Build app", npmCommand, ["run", "build"]);

if (composeFile) {
  await run("Start Docker services", dockerCommand, ["compose", "-f", composeFile, "up", "-d"]);
} else {
  console.log("[startup] No compose file found; skipping Docker service startup.");
  console.log("[startup] Set PUI_DOCKER_COMPOSE_FILE=/path/to/compose.yml if it lives outside the repo root.");
}

await run(`Run ${webCommand}`, npmCommand, ["run", webCommand], { passthroughSignals: true });

function run(label, command, args, options = {}) {
  console.log(`[startup] ${label}`);

  return new Promise((resolve, reject) => {
    let receivedSignal;
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env: process.env
    });

    const forwardSignal = (signal) => () => {
      receivedSignal = signal;
      if (!child.killed) {
        child.kill(signal);
      }
    };

    const forwardSigint = forwardSignal("SIGINT");
    const forwardSigterm = forwardSignal("SIGTERM");

    if (options.passthroughSignals) {
      process.once("SIGINT", forwardSigint);
      process.once("SIGTERM", forwardSigterm);
    }

    child.on("error", (error) => {
      cleanup();
      reject(new Error(`${label} failed to start: ${error.message}`));
    });

    child.on("exit", (code, signal) => {
      cleanup();

      if (receivedSignal && signal === receivedSignal) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`${label} exited with signal ${signal}`));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} exited with code ${code}`));
    });

    function cleanup() {
      if (options.passthroughSignals) {
        process.off("SIGINT", forwardSigint);
        process.off("SIGTERM", forwardSigterm);
      }
    }
  });
}
