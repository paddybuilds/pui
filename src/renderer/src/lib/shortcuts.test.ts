import { describe, expect, it } from "vitest";
import { matchesShortcut, shortcutLabel } from "./shortcuts";

describe("shortcuts", () => {
  it("matches CmdOrCtrl shortcuts with either primary modifier", () => {
    const event = new KeyboardEvent("keydown", { key: "1", metaKey: true });
    expect(matchesShortcut(event, "CmdOrCtrl+1")).toBe(true);
  });

  it("formats shortcut labels", () => {
    expect(shortcutLabel("CmdOrCtrl+Shift+K")).toBe("⌘+⇧+K");
  });
});
