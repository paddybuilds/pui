import { describe, expect, it } from "vitest";
import { matchesShortcut, shortcutLabel } from "./shortcuts";

describe("shortcuts", () => {
  it("matches CmdOrCtrl shortcuts with either primary modifier", () => {
    const event = new KeyboardEvent("keydown", { key: "1", metaKey: true });
    expect(matchesShortcut(event, "CmdOrCtrl+1")).toBe(true);
  });

  it("matches CmdOrCtrl shortcuts with Ctrl on Windows", () => {
    const event = new KeyboardEvent("keydown", { key: "d", ctrlKey: true });
    expect(matchesShortcut(event, "CmdOrCtrl+D")).toBe(true);
  });

  it("matches shifted CmdOrCtrl shortcuts", () => {
    const event = new KeyboardEvent("keydown", { key: "D", ctrlKey: true, shiftKey: true });
    expect(matchesShortcut(event, "CmdOrCtrl+Shift+D")).toBe(true);
  });

  it("formats macOS shortcut labels", () => {
    expect(shortcutLabel("CmdOrCtrl+Shift+K")).toBe("⌘+⇧+K");
  });

  it("formats Windows shortcut labels", () => {
    expect(shortcutLabel("CmdOrCtrl+Shift+K", "win32")).toBe("Ctrl + Shift + K");
  });
});
