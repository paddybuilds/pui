import { describe, expect, it } from "vitest";
import { CodexSubagentTracker, normalizeCodexHookEvent } from "./codexHooks";

describe("codex hook helpers", () => {
  it("normalizes Codex hook payloads with Pui terminal metadata", () => {
    expect(
      normalizeCodexHookEvent({
        hook: {
          hook_event_name: "SessionStart",
          session_id: "codex-session",
          agent_id: "agent-session",
          agent_type: "default"
        },
        env: {
          puiWorkspaceId: "workspace-a",
          puiPaneId: "pane-a",
          puiTerminalSessionId: "terminal-a",
          cwd: "C:\\repo"
        }
      })
    ).toEqual({
      eventName: "SessionStart",
      codexSessionId: "codex-session",
      agentId: "agent-session",
      agentType: "default",
      puiWorkspaceId: "workspace-a",
      puiPaneId: "pane-a",
      puiTerminalSessionId: "terminal-a",
      cwd: "C:\\repo"
    });
  });

  it("normalizes direct Codex hook stdin payloads", () => {
    expect(
      normalizeCodexHookEvent({
        hook_event_name: "session_start",
        session_id: "codex-session",
        agent_id: "agent-session",
        agent_type: "default",
        pui_workspace_id: "workspace-a",
        pui_pane_id: "pane-a",
        pui_terminal_session_id: "terminal-a",
        cwd: "C:\\repo"
      })
    ).toEqual({
      eventName: "SessionStart",
      codexSessionId: "codex-session",
      agentId: "agent-session",
      agentType: "default",
      puiWorkspaceId: "workspace-a",
      puiPaneId: "pane-a",
      puiTerminalSessionId: "terminal-a",
      cwd: "C:\\repo"
    });
  });

  it("treats the first session as parent and later sessions as subagents", () => {
    const tracker = new CodexSubagentTracker();
    const parent = normalizeCodexHookEvent({
      hook: { hook_event_name: "SessionStart", session_id: "parent" },
      env: { puiTerminalSessionId: "terminal-a" }
    });
    const child = normalizeCodexHookEvent({
      hook: { hook_event_name: "SessionStart", session_id: "child" },
      env: { puiTerminalSessionId: "terminal-a" }
    });

    expect(parent && tracker.shouldEmit(parent)).toBe(false);
    expect(child && tracker.shouldEmit(child)).toBe(true);
    expect(child?.agentId).toBe("child");
    expect(child && tracker.shouldEmit(child)).toBe(false);
  });

  it("uses explicit agent metadata as a subagent discriminator", () => {
    const tracker = new CodexSubagentTracker();
    const event = normalizeCodexHookEvent({
      hook: { hook_event_name: "SessionStart", session_id: "child", agent_id: "agent-1" },
      env: { puiTerminalSessionId: "terminal-a" }
    });

    expect(event && tracker.shouldEmit(event)).toBe(true);
  });

  it("clears parent correlation when the parent Codex session stops", () => {
    const tracker = new CodexSubagentTracker();
    const firstParent = normalizeCodexHookEvent({
      hook: { hook_event_name: "SessionStart", session_id: "parent-a" },
      env: { puiTerminalSessionId: "terminal-a" }
    });
    const firstStop = normalizeCodexHookEvent({
      hook: { hook_event_name: "Stop", session_id: "parent-a" },
      env: { puiTerminalSessionId: "terminal-a" }
    });
    const secondParent = normalizeCodexHookEvent({
      hook: { hook_event_name: "SessionStart", session_id: "parent-b" },
      env: { puiTerminalSessionId: "terminal-a" }
    });

    expect(firstParent && tracker.shouldEmit(firstParent)).toBe(false);
    expect(firstStop && tracker.shouldEmit(firstStop)).toBe(false);
    expect(secondParent && tracker.shouldEmit(secondParent)).toBe(false);
  });
});
