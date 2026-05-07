import { describe, expect, it } from "vitest";
import type { AppSettings, TerminalWorkspace, WorkbenchNode } from "../../../shared/types";
import {
  appendWorkbenchNode,
  buildSplitTracks,
  cloneWorkbenchNodeWithNewIds,
  collectPanes,
  normalizeLayoutRoot,
  normalizeSplitSizes,
  remapProfileIds,
  removePane,
  resizeAdjacentSplitSizes,
  splitPane,
  updateSplitSizes,
  updateWorkspaceLayoutInSettings
} from "./workbenchLayout";

function idFactory(ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

describe("workbench layout helpers", () => {
  it("normalizes split sizes and builds split tracks", () => {
    expect(normalizeSplitSizes(undefined, 0)).toEqual([]);
    expect(normalizeSplitSizes([2, 0, Number.NaN, 1], 4)).toEqual([0.4, 0.2, 0.2, 0.2]);
    expect(buildSplitTracks([0.4, 0.6], 5)).toBe("0.4fr 5px 0.6fr");
  });

  it("resizes adjacent split panes without changing invalid boundaries", () => {
    const sizes = [0.5, 0.5];

    const resized = resizeAdjacentSplitSizes(sizes, 0, 20, 100);
    expect(resized[0]).toBeCloseTo(0.7);
    expect(resized[1]).toBeCloseTo(0.3);
    expect(resizeAdjacentSplitSizes(sizes, -1, 20, 100)).toBe(sizes);
    expect(resizeAdjacentSplitSizes(sizes, 0, 20, 0)).toBe(sizes);
  });

  it("normalizes legacy pane layouts into a workbench tree", () => {
    const root = normalizeLayoutRoot(
      {
        activePaneId: "pane-a",
        direction: "down",
        panes: [
          { id: "pane-a", profileId: "profile-a" },
          { id: "pane-b", profileId: "missing-profile" }
        ]
      } as TerminalWorkspace["layout"],
      "fallback-profile",
      new Set(["profile-a", "fallback-profile"]),
      idFactory(["split-a"])
    );

    expect(root).toEqual({
      type: "split",
      id: "split-a",
      direction: "down",
      children: [
        { type: "pane", id: "pane-a", profileId: "profile-a" },
        { type: "pane", id: "pane-b", profileId: "fallback-profile" }
      ],
      sizes: [0.5, 0.5]
    });
    expect(collectPanes(root)).toEqual([
      { id: "pane-a", profileId: "profile-a" },
      { id: "pane-b", profileId: "fallback-profile" }
    ]);
  });

  it("splits, resizes, and removes panes immutably", () => {
    const root: WorkbenchNode = { type: "pane", id: "pane-a", profileId: "profile-a" };
    const split = splitPane(root, "pane-a", "right", { id: "pane-b", profileId: "profile-b" }, idFactory(["split-a"]));

    expect(split).toEqual({
      type: "split",
      id: "split-a",
      direction: "right",
      children: [root, { type: "pane", id: "pane-b", profileId: "profile-b" }],
      sizes: [0.5, 0.5]
    });

    const resized = updateSplitSizes(split, "split-a", [2, 1]);
    expect(resized).toEqual({
      ...split,
      sizes: [2 / 3, 1 / 3]
    });
    expect(split).toEqual({
      type: "split",
      id: "split-a",
      direction: "right",
      children: [root, { type: "pane", id: "pane-b", profileId: "profile-b" }],
      sizes: [0.5, 0.5]
    });
    expect(removePane(split, "pane-b")).toEqual(root);
  });

  it("appends nodes and remaps moved profile IDs", () => {
    const root: WorkbenchNode = {
      type: "split",
      id: "split-a",
      direction: "down",
      children: [
        { type: "pane", id: "pane-a", profileId: "profile-a" },
        { type: "pane", id: "pane-b", profileId: "profile-b" }
      ],
      sizes: [0.75, 0.25]
    };
    const movedRoot = remapProfileIds(
      { type: "pane", id: "pane-c", profileId: "profile-c" },
      new Map([["profile-c", "profile-c-moved"]])
    );

    expect(appendWorkbenchNode(root, movedRoot, "down", idFactory(["unused"]))).toEqual({
      ...root,
      children: [...root.children, { type: "pane", id: "pane-c", profileId: "profile-c-moved" }],
      sizes: [0.375, 0.125, 0.5]
    });
  });

  it("clones workbench nodes with new IDs and maps the active pane", () => {
    const root: WorkbenchNode = {
      type: "split",
      id: "split-a",
      direction: "right",
      children: [
        { type: "pane", id: "pane-a", profileId: "profile-a" },
        { type: "pane", id: "pane-b", profileId: "profile-b" }
      ],
      sizes: [0.4, 0.6]
    };

    const cloned = cloneWorkbenchNodeWithNewIds(root, "pane-b", idFactory(["split-new", "pane-a-new", "pane-b-new"]));

    expect(cloned).toEqual({
      root: {
        type: "split",
        id: "split-new",
        direction: "right",
        children: [
          { type: "pane", id: "pane-a-new", profileId: "profile-a" },
          { type: "pane", id: "pane-b-new", profileId: "profile-b" }
        ],
        sizes: [0.4, 0.6]
      },
      activePaneId: "pane-b-new"
    });
    expect((cloned.root as Extract<WorkbenchNode, { type: "split" }>).sizes).not.toBe(root.sizes);
  });

  it("updates only the target workspace layout in settings", () => {
    const root: WorkbenchNode = { type: "pane", id: "pane-next", profileId: "profile-a" };
    const settings: AppSettings = {
      workspace: "/repo/a",
      profiles: [],
      recentWorkspaces: [],
      activeWorkspaceId: "workspace-a",
      workspaces: [
        {
          id: "workspace-a",
          name: "A",
          kind: "folder",
          path: "/repo/a",
          profiles: [],
          layout: { activePaneId: "pane-old", root: { type: "pane", id: "pane-old" } }
        },
        {
          id: "workspace-b",
          name: "B",
          kind: "folder",
          path: "/repo/b",
          profiles: [],
          layout: { activePaneId: "pane-b", root: { type: "pane", id: "pane-b" } }
        }
      ]
    };

    expect(updateWorkspaceLayoutInSettings(settings, "workspace-a", root, "pane-next")).toEqual({
      ...settings,
      activeWorkspaceId: "workspace-a",
      workspaces: [
        {
          ...settings.workspaces?.[0],
          layout: { activePaneId: "pane-next", root }
        },
        settings.workspaces?.[1]
      ]
    });
  });
});
