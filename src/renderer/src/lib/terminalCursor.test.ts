import { describe, expect, it, vi } from "vitest";
import { applyTerminalCursorActiveState, type TerminalCursorTarget } from "./terminalCursor";

function createTerminal(): TerminalCursorTarget {
  return {
    options: { cursorBlink: true },
    blur: vi.fn(),
    focus: vi.fn()
  };
}

describe("applyTerminalCursorActiveState", () => {
  it("enables blinking without touching terminal focus or rendering", () => {
    const terminal = createTerminal();

    applyTerminalCursorActiveState(terminal, true);

    expect(terminal.options.cursorBlink).toBe(true);
    expect(terminal.focus).not.toHaveBeenCalled();
    expect(terminal.blur).not.toHaveBeenCalled();
  });

  it("disables blinking and blurs inactive terminals without forcing a refresh", () => {
    const terminal = createTerminal();

    applyTerminalCursorActiveState(terminal, false);

    expect(terminal.options.cursorBlink).toBe(false);
    expect(terminal.blur).toHaveBeenCalledTimes(1);
    expect(terminal.focus).not.toHaveBeenCalled();
  });
});
