import http from "node:http";
import { readFile } from "node:fs/promises";

const configPath = process.argv[2] || process.env.PUI_CODEX_HOOK_CONFIG;

if (!configPath) {
  process.exit(0);
}

const rawInput = await readStdin();

try {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (!config.url || !config.token) {
    process.exit(0);
  }

  const payload = {
    hook: parseJson(rawInput),
    rawInput,
    env: {
      puiWorkspaceId: process.env.PUI_WORKSPACE_ID,
      puiPaneId: process.env.PUI_PANE_ID,
      puiTerminalSessionId: process.env.PUI_TERMINAL_SESSION_ID,
      cwd: process.env.PWD || process.env.CWD
    }
  };

  await postJson(config.url, config.token, payload);
} catch {
  // Hooks should never block Codex if Pui is not running or the local receiver is unavailable.
}

process.exit(0);

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.resume();
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function postJson(url, token, payload) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(url);
    const body = JSON.stringify(payload);
    const request = http.request(
      {
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: endpoint.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-Pui-Token": token
        },
        timeout: 1_000
      },
      (response) => {
        response.resume();
        response.on("end", resolve);
      }
    );
    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy(new Error("Pui Codex hook receiver timed out"));
    });
    request.write(body);
    request.end();
  });
}
