import { describe, expect, it } from "vitest";
import type { QuickCommand, TerminalWorkspace } from "./types";
import { createQuickCommandProfile, normalizeWorkspaceWorkflow } from "./workflow";

const workspace: TerminalWorkspace = {
  id: "workspace-1",
  name: "Pui",
  kind: "folder",
  path: "/repo",
  defaultCwd: "/repo/app",
  profiles: [],
  layout: {
    activePaneId: "pane-1",
    root: { type: "pane", id: "pane-1" }
  }
};

describe("workspace workflow helpers", () => {
  it("normalizes missing preset and command collections", () => {
    expect(normalizeWorkspaceWorkflow(workspace).layoutPresets).toEqual([]);
    expect(normalizeWorkspaceWorkflow(workspace).quickCommands).toEqual([]);
  });

  it("builds quick command profiles with folder cwd fallback", () => {
    const command: QuickCommand = {
      id: "test",
      name: "Test",
      command: "npm",
      args: ["test"],
      splitDirection: "down"
    };

    expect(createQuickCommandProfile(command, workspace, () => "profile-1")).toMatchObject({
      id: "profile-1",
      name: "Test",
      cwd: "/repo/app",
      command: "npm",
      args: ["test"]
    });
  });
});
