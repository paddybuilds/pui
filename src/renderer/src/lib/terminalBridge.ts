import type { ConsoleProfile, TerminalSession } from "../../../shared/types";

type DataCallback = (payload: { sessionId: string; data: string }) => void;
type ExitCallback = (payload: { sessionId: string; exitCode: number; signal?: number }) => void;

type PendingRequest = {
  resolve: (session: TerminalSession) => void;
  reject: (error: Error) => void;
};

class TerminalBridge {
  private socket: WebSocket | null = null;
  private connectPromise: Promise<WebSocket> | null = null;
  private pending = new Map<string, PendingRequest>();
  private dataCallbacks = new Set<DataCallback>();
  private exitCallbacks = new Set<ExitCallback>();

  create(payload: { profile: ConsoleProfile; paneId: string; cols: number; rows: number }): Promise<TerminalSession> {
    return this.connect().then(
      (socket) =>
        new Promise<TerminalSession>((resolve, reject) => {
          const requestId = crypto.randomUUID();
          this.pending.set(requestId, { resolve, reject });
          socket.send(JSON.stringify({ type: "create", requestId, ...payload }));
        })
    );
  }

  async write(sessionId: string, data: string): Promise<void> {
    this.send({ type: "write", sessionId, data });
  }

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    this.send({ type: "resize", sessionId, cols, rows });
  }

  async kill(sessionId: string): Promise<void> {
    this.send({ type: "kill", sessionId });
  }

  onData(callback: DataCallback): () => void {
    this.dataCallbacks.add(callback);
    return () => {
      this.dataCallbacks.delete(callback);
    };
  }

  onExit(callback: ExitCallback): () => void {
    this.exitCallbacks.add(callback);
    return () => {
      this.exitCallbacks.delete(callback);
    };
  }

  private send(payload: unknown): void {
    void this.connect().then((socket) => {
      socket.send(JSON.stringify(payload));
    });
  }

  private connect(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.socket);
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket("ws://127.0.0.1:4317");
      const timeout = window.setTimeout(() => {
        reject(new Error("Terminal bridge timed out"));
      }, 2500);

      socket.addEventListener("open", () => {
        window.clearTimeout(timeout);
        this.socket = socket;
        this.connectPromise = null;
        resolve(socket);
      });

      socket.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });

      socket.addEventListener("close", () => {
        this.socket = null;
        this.connectPromise = null;
      });

      socket.addEventListener("error", () => {
        window.clearTimeout(timeout);
        this.socket = null;
        this.connectPromise = null;
        reject(new Error("Terminal bridge is not running"));
      });
    });

    return this.connectPromise;
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") {
      return;
    }

    const message = JSON.parse(raw) as
      | { type: "created"; requestId: string; session: TerminalSession }
      | { type: "data"; sessionId: string; data: string }
      | { type: "exit"; sessionId: string; exitCode: number; signal?: number };

    if (message.type === "created") {
      this.pending.get(message.requestId)?.resolve(message.session);
      this.pending.delete(message.requestId);
      return;
    }

    if (message.type === "data") {
      for (const callback of this.dataCallbacks) {
        callback({ sessionId: message.sessionId, data: message.data });
      }
      return;
    }

    if (message.type === "exit") {
      for (const callback of this.exitCallbacks) {
        callback({ sessionId: message.sessionId, exitCode: message.exitCode, signal: message.signal });
      }
    }
  }
}

export const terminalBridge = new TerminalBridge();
