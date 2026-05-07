export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.at(-1);
  const wantsMeta = parts.includes("cmd") || parts.includes("cmdorctrl");
  const wantsCtrl = parts.includes("ctrl") || parts.includes("cmdorctrl");
  const wantsShift = parts.includes("shift");
  const wantsAlt = parts.includes("alt") || parts.includes("option");

  const modifierMatch =
    (!wantsMeta || event.metaKey || (parts.includes("cmdorctrl") && event.ctrlKey)) &&
    (!wantsCtrl || event.ctrlKey || (parts.includes("cmdorctrl") && event.metaKey)) &&
    event.shiftKey === wantsShift &&
    event.altKey === wantsAlt;

  return modifierMatch && event.key.toLowerCase() === key;
}

export function shortcutLabel(shortcut: string, platform = "darwin"): string {
  if (platform === "win32" || platform === "linux") {
    return shortcut
      .replace("CmdOrCtrl", "Ctrl")
      .replace("Command", "Ctrl")
      .replace("Cmd", "Ctrl")
      .replace(/\+/g, " + ");
  }

  return shortcut.replace("CmdOrCtrl", "⌘").replace("Ctrl", "⌃").replace("Alt", "⌥").replace("Shift", "⇧");
}
