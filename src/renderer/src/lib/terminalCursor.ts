export type TerminalCursorTarget = {
  options: {
    cursorBlink?: boolean;
  };
  blur: () => void;
  focus: () => void;
};

export function applyTerminalCursorActiveState(terminal: TerminalCursorTarget, active: boolean): void {
  terminal.options.cursorBlink = active;

  if (!active) {
    terminal.blur();
  }
}
