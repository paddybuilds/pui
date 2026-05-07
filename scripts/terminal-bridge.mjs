import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { WebSocketServer } from "ws";
import pty from "node-pty";

const port = Number(process.env.PUI_TERMINAL_BRIDGE_PORT || 4317);
const sessions = new Map();
const execFileAsync = promisify(execFile);

const httpServer = createServer((request, response) => {
  void handleHttpRequest(request, response);
});

const server = new WebSocketServer({ server: httpServer });

server.on("connection", (socket) => {
  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message.type === "create") {
      createSession(socket, message);
      return;
    }

    const record = sessions.get(message.sessionId);
    if (!record) {
      return;
    }

    if (message.type === "write") {
      record.pty.write(message.data || "");
      return;
    }

    if (message.type === "resize") {
      const cols = Math.max(1, Number(message.cols || 80));
      const rows = Math.max(1, Number(message.rows || 24));
      record.pty.resize(cols, rows);
      return;
    }

    if (message.type === "kill") {
      record.pty.kill();
      sessions.delete(message.sessionId);
    }
  });

  socket.on("close", () => {
    for (const [sessionId, record] of sessions) {
      if (record.socket === socket) {
        record.pty.kill();
        sessions.delete(sessionId);
      }
    }
  });
});

httpServer.listen(port, "127.0.0.1", () => {
  console.log(`[pui-terminal-bridge] ws://127.0.0.1:${port}`);
});

httpServer.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(`[pui-terminal-bridge] port ${port} already in use`);
    return;
  }
  console.error(error);
});

function createSession(socket, message) {
  const profile = message.profile || {};
  const shell = profile.command || process.env.SHELL || os.userInfo().shell || "/bin/zsh";
  const cwd = path.resolve(profile.cwd || process.cwd());
  const sessionId = crypto.randomUUID();
  const child = pty.spawn(shell, profile.args || [], {
    name: "xterm-256color",
    cols: Math.max(1, Number(message.cols || 80)),
    rows: Math.max(1, Number(message.rows || 24)),
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PROMPT_EOL_MARK: "",
      ...(profile.env || {})
    }
  });

  sessions.set(sessionId, { pty: child, socket });

  child.onData((data) => {
    send(socket, { type: "data", sessionId, data });
  });

  child.onExit(({ exitCode, signal }) => {
    send(socket, { type: "exit", sessionId, exitCode, signal });
    sessions.delete(sessionId);
  });

  send(socket, {
    type: "created",
    requestId: message.requestId,
    session: {
      id: sessionId,
      profileId: profile.id,
      cwd,
      paneId: message.paneId,
      ptyProcessId: child.pid,
      status: "running"
    }
  });
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

async function handleHttpRequest(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  try {
    if (url.pathname === "/dialog/open-folder" && request.method === "GET") {
      sendJson(response, { path: await openFolderDialog(url.searchParams.get("defaultPath") || undefined) });
      return;
    }
    if (url.pathname === "/git/status" && request.method === "GET") {
      const workspace = requiredWorkspace(url);
      sendJson(response, await getGitStatus(workspace));
      return;
    }
    if (url.pathname === "/git/diff" && request.method === "GET") {
      const workspace = requiredWorkspace(url);
      const file = url.searchParams.get("file") || undefined;
      const cached = url.searchParams.get("cached") === "true";
      sendJson(response, await getGitDiff(workspace, file, cached));
      return;
    }
    if (url.pathname === "/git/commits" && request.method === "GET") {
      const workspace = requiredWorkspace(url);
      const limit = Number(url.searchParams.get("limit") || 16);
      sendJson(response, await getGitCommits(workspace, limit));
      return;
    }
    if (url.pathname === "/git/stage" && request.method === "POST") {
      const { workspace, paths } = await readJsonBody(request);
      await git(workspace, ["add", "--", ...paths]);
      sendJson(response, await getGitStatus(workspace));
      return;
    }
    if (url.pathname === "/git/unstage" && request.method === "POST") {
      const { workspace, paths } = await readJsonBody(request);
      await git(workspace, ["restore", "--staged", "--", ...paths]);
      sendJson(response, await getGitStatus(workspace));
      return;
    }
    if (url.pathname === "/git/discard" && request.method === "POST") {
      const { workspace, paths } = await readJsonBody(request);
      sendJson(response, await discardGitPaths(workspace, paths));
      return;
    }

    sendJson(response, { error: "Not found" }, 404);
  } catch (error) {
    sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

async function openFolderDialog(defaultPath) {
  const script = defaultPath
    ? `POSIX path of (choose folder default location POSIX file ${JSON.stringify(defaultPath)})`
    : "POSIX path of (choose folder)";
  try {
    const result = await execFileAsync("osascript", ["-e", script]);
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function requiredWorkspace(url) {
  const workspace = url.searchParams.get("workspace");
  if (!workspace) {
    throw new Error("Missing workspace");
  }
  return workspace;
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
  }
  return JSON.parse(raw || "{}");
}

async function getGitStatus(workspace) {
  try {
    const [branchResult, statusResult] = await Promise.all([
      git(workspace, ["branch", "--show-current"]),
      git(workspace, ["status", "--porcelain=v1"])
    ]);
    return {
      workspace,
      isRepo: true,
      branch: branchResult.stdout.trim() || "HEAD",
      files: parseGitStatus(statusResult.stdout)
    };
  } catch (error) {
    return {
      workspace,
      isRepo: false,
      files: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getGitDiff(workspace, file, cached = false) {
  const args = ["diff", "--no-ext-diff", "--color=never"];
  if (cached) {
    args.push("--cached");
  }
  if (file) {
    args.push("--", file);
  }
  const result = await git(workspace, args);
  return { workspace, file, cached, text: result.stdout };
}

async function getGitCommits(workspace, limit = 16) {
  const safeLimit = Math.min(50, Math.max(1, Math.round(limit)));
  try {
    const result = await git(workspace, [
      "log",
      `-${safeLimit}`,
      "--date=short",
      "--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s"
    ]);
    return result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, author, date, subject] = line.split("\x1f");
        return { hash, shortHash, author, date, subject };
      });
  } catch {
    return [];
  }
}

async function discardGitPaths(workspace, paths) {
  const status = await getGitStatus(workspace);
  const untracked = new Set(
    status.files
      .filter((file) => file.indexStatus === "?" && file.workingTreeStatus === "?")
      .map((file) => file.path)
  );
  const untrackedPaths = paths.filter((targetPath) => untracked.has(targetPath));
  const trackedPaths = paths.filter((targetPath) => !untracked.has(targetPath));

  if (trackedPaths.length > 0) {
    await git(workspace, ["restore", "--source=HEAD", "--worktree", "--", ...trackedPaths]);
  }
  if (untrackedPaths.length > 0) {
    await git(workspace, ["clean", "-f", "--", ...untrackedPaths]);
  }
  return getGitStatus(workspace);
}

async function git(workspace, args) {
  const result = await execFileAsync("git", ["-C", workspace, ...args], {
    maxBuffer: 1024 * 1024 * 12
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function parseGitStatus(output) {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const indexStatus = line[0] ?? " ";
      const workingTreeStatus = line[1] ?? " ";
      const rawPath = line.slice(3);
      const renamedPath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) || rawPath : rawPath;
      return {
        path: renamedPath.trim(),
        indexStatus,
        workingTreeStatus
      };
    });
}
