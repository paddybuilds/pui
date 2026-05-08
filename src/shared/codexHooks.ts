import type { CodexHookEvent } from "./types";

export type IncomingCodexHookPayload = {
  hook?: unknown;
  rawInput?: string;
  env?: {
    puiWorkspaceId?: string;
    puiPaneId?: string;
    puiTerminalSessionId?: string;
    cwd?: string;
  };
};

export class CodexSubagentTracker {
  private readonly parentSessionsByTerminal = new Map<string, string>();
  private readonly emittedSubagents = new Set<string>();

  shouldEmit(event: CodexHookEvent): boolean {
    if (event.eventName === "Stop") {
      if (
        event.puiTerminalSessionId &&
        this.parentSessionsByTerminal.get(event.puiTerminalSessionId) === event.codexSessionId
      ) {
        this.parentSessionsByTerminal.delete(event.puiTerminalSessionId);
      }
      return false;
    }
    if (!event.puiTerminalSessionId || !event.codexSessionId) {
      return false;
    }

    const agentId = event.agentId || event.codexSessionId;
    if (event.agentId || event.agentType) {
      return this.mark(event, agentId);
    }

    const parentSession = this.parentSessionsByTerminal.get(event.puiTerminalSessionId);
    if (!parentSession) {
      this.parentSessionsByTerminal.set(event.puiTerminalSessionId, event.codexSessionId);
      return false;
    }
    if (parentSession === event.codexSessionId) {
      return false;
    }
    return this.mark(event, agentId);
  }

  private mark(event: CodexHookEvent, agentId: string): boolean {
    const key = `${event.puiTerminalSessionId}:${agentId}`;
    if (this.emittedSubagents.has(key)) {
      return false;
    }
    this.emittedSubagents.add(key);
    event.agentId = agentId;
    return true;
  }
}

export function normalizeCodexHookEvent(payload: IncomingCodexHookPayload): CodexHookEvent | undefined {
  const hook = isRecord(payload.hook) ? payload.hook : {};
  const eventName = readString(hook, "hook_event_name") || readString(hook, "event_name") || readString(hook, "eventName");
  const codexSessionId =
    readString(hook, "session_id") || readString(hook, "sessionId") || readString(hook, "thread_id");
  const normalizedName = normalizeEventName(eventName);
  if (!normalizedName || !codexSessionId) {
    return undefined;
  }

  return {
    eventName: normalizedName,
    codexSessionId,
    agentId: readString(hook, "agent_id") || readString(hook, "agentId"),
    agentType: readString(hook, "agent_type") || readString(hook, "agentType"),
    puiWorkspaceId: payload.env?.puiWorkspaceId,
    puiPaneId: payload.env?.puiPaneId,
    puiTerminalSessionId: payload.env?.puiTerminalSessionId,
    cwd: payload.env?.cwd
  };
}

function normalizeEventName(value: string | undefined): CodexHookEvent["eventName"] | undefined {
  if (!value) {
    return undefined;
  }
  const compact = value.replace(/[-_\s]/g, "").toLowerCase();
  if (compact === "sessionstart") {
    return "SessionStart";
  }
  if (compact === "stop") {
    return "Stop";
  }
  return undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
