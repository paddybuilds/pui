import os from "node:os";
import path from "node:path";
import { WebSocketServer } from "ws";
import pty from "node-pty";

const port = Number(process.env.PUI_TERMINAL_BRIDGE_PORT || 4317);
const sessions = new Map();

const server = new WebSocketServer({ host: "127.0.0.1", port });

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

server.on("listening", () => {
  console.log(`[pui-terminal-bridge] ws://127.0.0.1:${port}`);
});

server.on("error", (error) => {
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
