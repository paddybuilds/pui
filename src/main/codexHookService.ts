import { app, type BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { CodexSubagentTracker, normalizeCodexHookEvent, type IncomingCodexHookPayload } from "../shared/codexHooks";
import { ipc } from "../shared/ipc";
import type { CodexHookEvent, CodexHookInstallResult } from "../shared/types";

type HookReceiverConfig = {
  token: string;
  url: string;
};

const HOOK_EVENTS = ["session_start", "stop"] as const;
const HOOK_MARKER = "pui-codex-subagent-hook";
const HOOK_CONFIG_FILE = "pui-codex-hook.json";
const CODEX_CONFIG_DIR = ".codex";
const CODEX_CONFIG_FILE = "config.toml";
const CODEX_HOOKS_FILE = "hooks.json";

export class CodexHookService {
  private readonly subagentTracker = new CodexSubagentTracker();
  private server?: http.Server;
  private config?: HookReceiverConfig;

  constructor(private readonly window: BrowserWindow) {}

  async start(): Promise<void> {
    this.config = await this.loadOrCreateConfig();
    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(0, "127.0.0.1", () => {
        const address = this.server?.address();
        if (address && typeof address === "object" && this.config) {
          this.config = { ...this.config, url: `http://127.0.0.1:${address.port}/codex/hooks` };
          void this.writeConfig(this.config);
        }
        this.server?.off("error", reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
      if (!this.server) {
        resolve();
      }
    });
    this.server = undefined;
  }

  async installHooks(): Promise<CodexHookInstallResult> {
    const config = this.config ?? (await this.loadOrCreateConfig());
    this.config = config;
    const codexDir = join(app.getPath("home"), CODEX_CONFIG_DIR);
    await mkdir(codexDir, { recursive: true });
    await this.writeConfig(config);
    const hookCommand = await this.hookCommand();
    await writeCodexHooks(join(codexDir, CODEX_HOOKS_FILE), hookCommand);
    await enableCodexHooks(join(codexDir, CODEX_CONFIG_FILE));
    return {
      installed: true,
      hooksPath: join(codexDir, CODEX_HOOKS_FILE),
      configPath: join(codexDir, CODEX_CONFIG_FILE)
    };
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "POST" || request.url !== "/codex/hooks") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    if (!this.config || request.headers["x-pui-token"] !== this.config.token) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    try {
      const payload = JSON.parse(await readRequestBody(request)) as IncomingCodexHookPayload;
      const event = normalizeCodexHookEvent(payload);
      if (event && this.subagentTracker.shouldEmit(event)) {
        this.sendEvent(event);
      }
      sendJson(response, 204, {});
    } catch {
      sendJson(response, 400, { error: "Invalid hook payload" });
    }
  }

  private sendEvent(event: CodexHookEvent): void {
    if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
      this.window.webContents.send(ipc.codex.subagentDetected, event);
    }
  }

  private async loadOrCreateConfig(): Promise<HookReceiverConfig> {
    const path = hookConfigPath();
    if (existsSync(path)) {
      try {
        const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<HookReceiverConfig>;
        if (parsed.token) {
          return { token: parsed.token, url: parsed.url || "http://127.0.0.1:0/codex/hooks" };
        }
      } catch {
        // Fall through and replace invalid config.
      }
    }

    const config = { token: randomUUID(), url: "http://127.0.0.1:0/codex/hooks" };
    await this.writeConfig(config);
    return config;
  }

  private async writeConfig(config: HookReceiverConfig): Promise<void> {
    await mkdir(dirname(hookConfigPath()), { recursive: true });
    await writeFile(hookConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  private async hookCommand(): Promise<string> {
    const scriptPath = await this.ensureHookScript();
    const configPath = hookConfigPath();
    return `node ${quoteShell(scriptPath)} ${quoteShell(configPath)}`;
  }

  private async ensureHookScript(): Promise<string> {
    const sourcePath = join(app.getAppPath(), "scripts", "pui-codex-hook.mjs");
    const targetPath = join(app.getPath("userData"), "pui-codex-hook.mjs");
    const contents = await readFile(sourcePath, "utf8");
    await writeFile(targetPath, contents, "utf8");
    return targetPath;
  }
}

async function writeCodexHooks(path: string, command: string): Promise<void> {
  const current = existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : {};
  const root = isRecord(current) ? current : {};
  const hooks = isRecord(root.hooks) ? root.hooks : {};
  for (const eventName of Object.keys(hooks)) {
    const entries = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
    const nextEntries = entries.filter((entry) => !isPuiHookEntry(entry));
    if (nextEntries.length > 0) {
      hooks[eventName] = nextEntries;
    } else {
      delete hooks[eventName];
    }
  }
  for (const eventName of HOOK_EVENTS) {
    const entries = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
    hooks[eventName] = [
      ...entries,
      {
        hooks: [{ type: "command", command, marker: HOOK_MARKER }]
      }
    ];
  }
  root.hooks = hooks;
  await writeFile(path, `${JSON.stringify(root, null, 2)}\n`, "utf8");
}

async function enableCodexHooks(path: string): Promise<void> {
  const current = existsSync(path) ? await readFile(path, "utf8") : "";
  const lines = current.split(/\r?\n/);
  const featuresIndex = lines.findIndex((line) => line.trim() === "[features]");
  if (featuresIndex === -1) {
    const prefix = current.trimEnd();
    await writeFile(path, `${prefix ? `${prefix}\n\n` : ""}[features]\nhooks = true\n`, "utf8");
    return;
  }

  let insertAt = lines.length;
  let hasHooksFlag = false;
  for (let index = featuresIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) {
      insertAt = index;
      break;
    }
    if (/^\s*hooks\s*=/.test(lines[index])) {
      lines[index] = "hooks = true";
      hasHooksFlag = true;
      continue;
    }
    if (/^\s*codex_hooks\s*=/.test(lines[index])) {
      lines.splice(index, 1);
      index -= 1;
      insertAt -= 1;
    }
  }
  if (!hasHooksFlag) {
    lines.splice(insertAt, 0, "hooks = true");
  }
  await writeFile(path, `${lines.join("\n").trimEnd()}\n`, "utf8");
}

function isPuiHookEntry(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const hooks = Array.isArray(value.hooks) ? value.hooks : [];
  return hooks.some((hook) => isRecord(hook) && hook.marker === HOOK_MARKER);
}

function hookConfigPath(): string {
  return join(app.getPath("userData"), HOOK_CONFIG_FILE);
}

function quoteShell(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy(new Error("Hook payload too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(status === 204 ? "" : JSON.stringify(payload));
}
