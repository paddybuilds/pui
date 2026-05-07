import { describe, expect, it } from "vitest";
import {
  createLoadedCodeTab,
  createLoadingCodeTab,
  collectCodeEditorGroups,
  createCodeEditorGroup,
  markCodeTabSaved,
  nextActiveCodeTabPath,
  removeCodeEditorGroup,
  resizeAdjacentCodeSplitSizes,
  splitCodeEditorGroup,
  updateCodeTabContents,
  upsertCodeTab
} from "./codeWorkspace";

describe("code workspace tab helpers", () => {
  it("creates and updates dirty tabs", () => {
    const loaded = createLoadedCodeTab({
      kind: "text",
      path: "/repo/src/App.tsx",
      relativePath: "src/App.tsx",
      name: "App.tsx",
      contents: "before",
      mimeType: "text/plain",
      size: 6,
      modifiedAt: "2026-05-07T22:00:00.000Z"
    });

    const changed = updateCodeTabContents([loaded], loaded.path, "after");
    expect(changed[0]).toMatchObject({ contents: "after", dirty: true });
    expect(markCodeTabSaved(changed, loaded.path, { size: 5, modifiedAt: "now" })[0]).toMatchObject({
      savedContents: "after",
      dirty: false,
      size: 5
    });
  });

  it("upserts loading and loaded tabs by path", () => {
    const loading = createLoadingCodeTab("/repo/README.md");
    const loaded = createLoadedCodeTab({
      kind: "text",
      path: "/repo/README.md",
      relativePath: "README.md",
      name: "README.md",
      contents: "readme",
      mimeType: "text/plain",
      size: 6,
      modifiedAt: "now"
    });

    expect(upsertCodeTab([], loading)).toHaveLength(1);
    expect(upsertCodeTab([loading], loaded)).toEqual([loaded]);
  });

  it("selects the nearest tab after closing the active tab", () => {
    const tabs = ["/repo/a.ts", "/repo/b.ts", "/repo/c.ts"].map(createLoadingCodeTab);

    expect(nextActiveCodeTabPath(tabs, "/repo/b.ts", "/repo/b.ts")).toBe("/repo/a.ts");
    expect(nextActiveCodeTabPath(tabs, "/repo/b.ts", "/repo/c.ts")).toBe("/repo/c.ts");
    expect(nextActiveCodeTabPath([tabs[0]], "/repo/a.ts", "/repo/a.ts")).toBeUndefined();
  });

  it("splits, resizes, and removes editor groups", () => {
    const root = createCodeEditorGroup("group-a", "/repo/a.ts");
    const split = splitCodeEditorGroup(
      root,
      "group-a",
      "right",
      { splitId: "split-a", groupId: "group-b" },
      "/repo/a.ts"
    );

    expect(collectCodeEditorGroups(split).map((group) => group.id)).toEqual(["group-a", "group-b"]);
    expect(split).toMatchObject({
      type: "split",
      direction: "right",
      sizes: [0.5, 0.5]
    });

    expect(resizeAdjacentCodeSplitSizes([0.5, 0.5], 0, 20, 100)).toEqual([0.7, 0.3]);
    expect(removeCodeEditorGroup(split, "group-b")).toEqual(root);
  });
});
