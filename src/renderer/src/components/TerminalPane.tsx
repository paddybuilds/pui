import { type MouseEvent, useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import { X } from "lucide-react";
import type { ConsoleProfile, TerminalPaneSnapshot } from "../../../shared/types";
import { getPuiApi } from "../lib/browserApi";
import { matchesShortcut } from "../lib/shortcuts";

type Pane = {
  id: string;
  profileId?: string;
  sessionId?: string;
};

type TerminalPaneProps = {
  pane: Pane;
  workspaceId: string;
  profile: ConsoleProfile;
  workspaceName: string;
  terminalFontSize?: number;
  terminalTheme: ITheme;
  terminalThemeKey: string;
  active: boolean;
  showHeader: boolean;
  canClose: boolean;
  onFocus: () => void;
  onClose: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onSession: (sessionId: string) => void;
  initialSnapshot?: TerminalPaneSnapshot;
  onSnapshot?: (snapshot: TerminalPaneSnapshot) => void;
  onContextMenu: (event: MouseEvent) => void;
};

type TerminalRecord = {
  terminal: Terminal;
  fit: FitAddon;
  sessionId?: string;
  inputDisposable: { dispose: () => void };
  shortcutHandler: { current: ((event: KeyboardEvent) => boolean) | undefined };
  outputChunks: string[];
  outputBytes: number;
  outputDroppedBytes: number;
  outputFlushFrame?: number;
  inputChunks: string[];
  inputBytes: number;
  inputFlushFrame?: number;
  fitFrame?: number;
  lastResize?: { cols: number; rows: number };
  exited: boolean;
  disposed: boolean;
  outputWriteInProgress: boolean;
  lastSnapshotAt: number;
  snapshotFrame?: number;
  snapshotTimeout?: number;
  onSnapshot?: (snapshot: TerminalPaneSnapshot) => void;
};

const MAX_TERMINAL_WRITE_CHUNK = 96 * 1024;
const MAX_TERMINAL_OUTPUT_BUFFER = 2 * 1024 * 1024;
const MAX_TERMINAL_INPUT_CHUNK = 16 * 1024;
const MAX_TERMINAL_INPUT_BUFFER = 512 * 1024;
const MAX_TERMINAL_SNAPSHOT_LINES = 300;
const MAX_TERMINAL_SNAPSHOT_CHARS = 80_000;
const TERMINAL_SNAPSHOT_IDLE_MS = 1_500;
const TERMINAL_SNAPSHOT_INTERVAL_MS = 10_000;
const terminalRecords = new Map<string, TerminalRecord>();
const terminalRecordsBySession = new Map<string, TerminalRecord>();
let offTerminalData: (() => void) | undefined;
let offTerminalExit: (() => void) | undefined;
const pui = getPuiApi();

export function terminalRecordKey(workspaceId: string, paneId: string): string {
  return `${workspaceId}:${paneId}`;
}

export function disposeTerminalPane(workspaceId: string, paneId: string): void {
  const key = terminalRecordKey(workspaceId, paneId);
  const record = terminalRecords.get(key);
  if (!record) {
    return;
  }

  record.inputDisposable.dispose();
  unregisterTerminalSession(record);
  record.disposed = true;
  cancelPendingTerminalWork(record);
  if (record.sessionId && !record.exited) {
    void pui.terminal.kill(record.sessionId);
  }
  record.terminal.dispose();
  terminalRecords.delete(key);
  maybeStopTerminalEventRouter();
}

export function disposeTerminalPanes(workspaceId: string, paneIds: string[]): void {
  for (const paneId of paneIds) {
    disposeTerminalPane(workspaceId, paneId);
  }
}

export function moveTerminalPaneRecord(fromWorkspaceId: string, toWorkspaceId: string, paneId: string): void {
  const fromKey = terminalRecordKey(fromWorkspaceId, paneId);
  const record = terminalRecords.get(fromKey);
  if (!record) {
    return;
  }
  terminalRecords.delete(fromKey);
  terminalRecords.set(terminalRecordKey(toWorkspaceId, paneId), record);
}

export function pasteIntoTerminalPane(workspaceId: string, paneId: string): void {
  const record = terminalRecords.get(terminalRecordKey(workspaceId, paneId));
  if (!record) {
    return;
  }

  void pasteClipboardIntoTerminal(record);
}

export function copyTerminalPaneSelection(workspaceId: string, paneId: string): void {
  const record = terminalRecords.get(terminalRecordKey(workspaceId, paneId));
  if (!record) {
    return;
  }

  void copyTerminalSelection(record);
}

export function hasTerminalPaneSelection(workspaceId: string, paneId: string): boolean {
  const record = terminalRecords.get(terminalRecordKey(workspaceId, paneId));
  return record?.terminal.hasSelection() ?? false;
}

export function TerminalPane({
  pane,
  workspaceId,
  profile,
  workspaceName,
  terminalFontSize = 13,
  terminalTheme,
  terminalThemeKey,
  active,
  showHeader,
  canClose,
  onFocus,
  onClose,
  onSplitRight,
  onSplitDown,
  onSession,
  initialSnapshot,
  onSnapshot,
  onContextMenu
}: TerminalPaneProps) {
  const xtermMountRef = useRef<HTMLDivElement | null>(null);
  const recordRef = useRef<TerminalRecord | null>(null);
  const onSessionRef = useRef(onSession);
  const initialSnapshotRef = useRef(initialSnapshot);
  const onSnapshotRef = useRef(onSnapshot);
  const activeRef = useRef(active);
  const profileRef = useRef(profile);
  const terminalThemeRef = useRef(terminalTheme);
  const terminalFontSizeRef = useRef(terminalFontSize);
  const shortcutActionsRef = useRef({ canClose, onClose, onSplitRight, onSplitDown });

  useEffect(() => {
    onSessionRef.current = onSession;
  });

  useEffect(() => {
    activeRef.current = active;
    profileRef.current = profile;
    terminalThemeRef.current = terminalTheme;
    terminalFontSizeRef.current = terminalFontSize;
  });

  useEffect(() => {
    initialSnapshotRef.current = initialSnapshot;
  }, [initialSnapshot]);

  useEffect(() => {
    shortcutActionsRef.current = { canClose, onClose, onSplitRight, onSplitDown };
  });

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
    if (recordRef.current) {
      recordRef.current.onSnapshot = onSnapshot;
    }
  }, [onSnapshot]);

  useEffect(() => {
    if (!xtermMountRef.current) {
      return;
    }

    const record = getOrCreateTerminalRecord(
      workspaceId,
      pane.id,
      pane.sessionId,
      profileRef.current,
      activeRef.current,
      terminalThemeRef.current,
      initialSnapshotRef.current,
      onSnapshotRef.current,
      (sessionId) => {
        onSessionRef.current(sessionId);
      }
    );
    recordRef.current = record;
    record.onSnapshot = onSnapshotRef.current;
    record.shortcutHandler.current = (event) => {
      const actions = shortcutActionsRef.current;
      if (isTerminalCopyShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        copyTerminalSelection(record);
        return false;
      }
      if (matchesShortcut(event, "CmdOrCtrl+V") || matchesShortcut(event, "CmdOrCtrl+Shift+V")) {
        event.preventDefault();
        event.stopPropagation();
        pasteIntoTerminalRecord(record);
        return false;
      }
      if (matchesShortcut(event, "CmdOrCtrl+D")) {
        event.preventDefault();
        event.stopPropagation();
        actions.onSplitRight();
        return false;
      }
      if (matchesShortcut(event, "CmdOrCtrl+Shift+D")) {
        event.preventDefault();
        event.stopPropagation();
        actions.onSplitDown();
        return false;
      }
      if (actions.canClose && matchesShortcut(event, "CmdOrCtrl+W")) {
        event.preventDefault();
        event.stopPropagation();
        actions.onClose();
        return false;
      }
      return true;
    };
    const mount = xtermMountRef.current;
    attachTerminalElement(record.terminal, mount);
    const handlePaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text) {
        return;
      }
      event.preventDefault();
      pasteTextIntoTerminal(record, text);
    };
    mount.addEventListener("paste", handlePaste, { capture: true });
    const handleCopy = (event: ClipboardEvent) => {
      const text = record.terminal.getSelection();
      if (!text) {
        return;
      }
      event.preventDefault();
      event.clipboardData?.setData("text/plain", text);
      void pui.clipboard.writeText(text);
    };
    mount.addEventListener("copy", handleCopy, { capture: true });
    record.terminal.options.cursorBlink = activeRef.current;
    applyTerminalAppearance(record.terminal, terminalThemeRef.current, terminalFontSizeRef.current);
    scheduleFitAndResize(record);
    if (record.sessionId) {
      onSessionRef.current(record.sessionId);
    }

    const observer = new ResizeObserver(() => {
      scheduleFitAndResize(record);
    });
    observer.observe(xtermMountRef.current);

    return () => {
      observer.disconnect();
      mount.removeEventListener("paste", handlePaste, { capture: true });
      mount.removeEventListener("copy", handleCopy, { capture: true });
      captureTerminalSnapshot(record);
      if (recordRef.current === record) {
        record.shortcutHandler.current = undefined;
      }
      detachTerminalElement(record.terminal, mount);
      recordRef.current = null;
    };
  }, [pane.id, pane.sessionId, workspaceId]);

  useEffect(() => {
    if (recordRef.current) {
      recordRef.current.terminal.options.cursorBlink = active;
      if (active) {
        recordRef.current.terminal.focus();
      }
    }
  }, [active]);

  useEffect(() => {
    if (recordRef.current) {
      applyTerminalAppearance(recordRef.current.terminal, terminalTheme, terminalFontSize);
      scheduleFitAndResize(recordRef.current);
    }
  }, [terminalFontSize, terminalTheme, terminalThemeKey]);

  const focusPane = () => {
    onFocus();
    recordRef.current?.terminal.focus();
    const textarea = xtermMountRef.current?.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
    textarea?.focus();
  };

  return (
    <div
      className={`${active ? "terminal-pane active" : "terminal-pane inactive"}${showHeader ? " has-header" : ""}`}
      tabIndex={0}
      onMouseDown={focusPane}
      onContextMenu={onContextMenu}
    >
      {showHeader ? (
        <div className="pane-header">
          <span className="profile-dot" style={{ background: profile.appearance.color }} />
          <span>{workspaceName}</span>
          <span className="pane-cwd">{profile.cwd}</span>
          {canClose ? (
            <button
              className="pane-close"
              type="button"
              title="Close pane"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="terminal-host">
        <div className="xterm-mount" ref={xtermMountRef} />
      </div>
    </div>
  );
}

async function pasteClipboardIntoTerminal(record: TerminalRecord): Promise<void> {
  if (record.disposed) {
    return;
  }

  const text = await pui.clipboard.readText();
  pasteTextIntoTerminal(record, text);
}

function copyTerminalSelection(record: TerminalRecord): void {
  if (record.disposed) {
    return;
  }

  const text = record.terminal.getSelection();
  if (text) {
    void pui.clipboard.writeText(text);
  }
}

function pasteIntoTerminalRecord(record: TerminalRecord): void {
  void pasteClipboardIntoTerminal(record);
}

function pasteTextIntoTerminal(record: TerminalRecord, text: string): void {
  if (!text || record.disposed) {
    return;
  }

  record.terminal.focus();
  queueTerminalInput(record, prepareTerminalPasteData(text, record.terminal.modes.bracketedPasteMode));
}

export function prepareTerminalPasteData(text: string, bracketedPasteMode: boolean): string {
  const prepared = text.replace(/\r?\n/g, "\r");
  return bracketedPasteMode ? `\x1b[200~${prepared}\x1b[201~` : prepared;
}

function isTerminalCopyShortcut(event: KeyboardEvent): boolean {
  if (matchesShortcut(event, "CmdOrCtrl+Shift+C")) {
    return true;
  }

  return (
    pui.platform === "darwin" &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "c"
  );
}

function getOrCreateTerminalRecord(
  workspaceId: string,
  paneId: string,
  existingSessionId: string | undefined,
  profile: ConsoleProfile,
  active: boolean,
  terminalTheme: ITheme,
  initialSnapshot: TerminalPaneSnapshot | undefined,
  onSnapshot: ((snapshot: TerminalPaneSnapshot) => void) | undefined,
  onSession: (sessionId: string) => void
): TerminalRecord {
  const key = terminalRecordKey(workspaceId, paneId);
  const existing = terminalRecords.get(key);
  if (existing) {
    existing.onSnapshot = onSnapshot;
    if (existingSessionId && existing.sessionId !== existingSessionId) {
      assignTerminalSession(existing, existingSessionId);
    }
    return existing;
  }

  ensureTerminalEventRouter();
  const terminal = new Terminal({
    cursorBlink: active,
    convertEol: true,
    fontFamily: "Geist Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.25,
    theme: terminalTheme
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  const shortcutHandler: TerminalRecord["shortcutHandler"] = { current: undefined };
  terminal.attachCustomKeyEventHandler((event) => shortcutHandler.current?.(event) ?? true);

  const record: TerminalRecord = {
    terminal,
    fit,
    shortcutHandler,
    inputDisposable: terminal.onData((data) => {
      queueTerminalInput(record, data);
    }),
    outputChunks: [],
    outputBytes: 0,
    outputDroppedBytes: 0,
    inputChunks: [],
    inputBytes: 0,
    exited: false,
    disposed: false,
    outputWriteInProgress: false,
    lastSnapshotAt: 0,
    onSnapshot
  };

  terminalRecords.set(key, record);
  if (!existingSessionId && initialSnapshot?.content) {
    terminal.write(`${initialSnapshot.content.replace(/\r?\n/g, "\r\n")}\r\n`);
  }
  if (existingSessionId) {
    assignTerminalSession(record, existingSessionId);
  }

  if (!record.sessionId) {
    void pui.terminal
      .create({
        profile,
        paneId,
        cols: terminal.cols,
        rows: terminal.rows
      })
      .then((session) => {
        if (!terminalRecords.has(key)) {
          void pui.terminal.kill(session.id);
          return;
        }
        assignTerminalSession(record, session.id);
        onSession(session.id);
        scheduleFitAndResize(record);
        if (session.ptyProcessId === 0) {
          terminal.writeln("terminal bridge unavailable");
        }
      });
  } else {
    onSession(record.sessionId);
  }

  return record;
}

function attachTerminalElement(terminal: Terminal, mount: HTMLDivElement): void {
  if (terminal.element) {
    if (terminal.element.parentElement !== mount || mount.children.length !== 1) {
      mount.replaceChildren(terminal.element);
    }
    return;
  }

  mount.replaceChildren();
  terminal.open(mount);
}

function detachTerminalElement(terminal: Terminal, mount: HTMLDivElement): void {
  if (terminal.element?.parentElement === mount) {
    terminal.element.remove();
  }
}

function ensureTerminalEventRouter(): void {
  if (offTerminalData) {
    return;
  }

  offTerminalData = pui.terminal.onData(({ sessionId, data }) => {
    const record = terminalRecordsBySession.get(sessionId);
    if (record) {
      queueTerminalOutput(record, data);
    }
  });
  offTerminalExit = pui.terminal.onExit(({ sessionId, exitCode }) => {
    const record = terminalRecordsBySession.get(sessionId);
    if (record && !record.exited) {
      record.exited = true;
      queueTerminalOutput(record, `\r\n[process exited with code ${exitCode}]\r\n`);
    }
  });
}

function maybeStopTerminalEventRouter(): void {
  if (terminalRecords.size > 0) {
    return;
  }

  offTerminalData?.();
  offTerminalExit?.();
  offTerminalData = undefined;
  offTerminalExit = undefined;
}

function assignTerminalSession(record: TerminalRecord, sessionId: string): void {
  unregisterTerminalSession(record);
  record.sessionId = sessionId;
  record.exited = false;
  terminalRecordsBySession.set(sessionId, record);
}

function unregisterTerminalSession(record: TerminalRecord): void {
  if (record.sessionId && terminalRecordsBySession.get(record.sessionId) === record) {
    terminalRecordsBySession.delete(record.sessionId);
  }
}

function queueTerminalInput(record: TerminalRecord, data: string): void {
  if (record.disposed || !record.sessionId) {
    return;
  }

  record.inputChunks.push(data);
  record.inputBytes += data.length;
  trimTerminalInputBuffer(record);
  scheduleTerminalInputFlush(record);
}

function scheduleTerminalInputFlush(record: TerminalRecord): void {
  if (record.disposed || record.inputFlushFrame !== undefined) {
    return;
  }

  record.inputFlushFrame = window.requestAnimationFrame(() => {
    record.inputFlushFrame = undefined;
    flushTerminalInput(record);
  });
}

function flushTerminalInput(record: TerminalRecord): void {
  if (record.disposed || !record.sessionId || record.inputBytes <= 0) {
    return;
  }

  while (record.sessionId && record.inputBytes > 0) {
    const input = takeTerminalInputChunk(record);
    if (!input) {
      break;
    }
    void pui.terminal.write(record.sessionId, input);
  }
}

function takeTerminalInputChunk(record: TerminalRecord): string {
  const parts: string[] = [];
  let remaining = MAX_TERMINAL_INPUT_CHUNK;

  while (remaining > 0 && record.inputChunks.length > 0) {
    const first = record.inputChunks[0];
    if (first.length <= remaining) {
      parts.push(first);
      record.inputChunks.shift();
      record.inputBytes -= first.length;
      remaining -= first.length;
      continue;
    }

    parts.push(first.slice(0, remaining));
    record.inputChunks[0] = first.slice(remaining);
    record.inputBytes -= remaining;
    remaining = 0;
  }

  return parts.join("");
}

function trimTerminalInputBuffer(record: TerminalRecord): void {
  while (record.inputBytes > MAX_TERMINAL_INPUT_BUFFER && record.inputChunks.length > 0) {
    const first = record.inputChunks[0];
    const overflow = record.inputBytes - MAX_TERMINAL_INPUT_BUFFER;
    if (first.length <= overflow) {
      record.inputChunks.shift();
      record.inputBytes -= first.length;
      continue;
    }

    record.inputChunks[0] = first.slice(overflow);
    record.inputBytes -= overflow;
  }
}

function cancelPendingTerminalWork(record: TerminalRecord): void {
  if (record.outputFlushFrame !== undefined) {
    window.cancelAnimationFrame(record.outputFlushFrame);
    record.outputFlushFrame = undefined;
  }
  if (record.inputFlushFrame !== undefined) {
    window.cancelAnimationFrame(record.inputFlushFrame);
    record.inputFlushFrame = undefined;
  }
  if (record.fitFrame !== undefined) {
    window.cancelAnimationFrame(record.fitFrame);
    record.fitFrame = undefined;
  }
  if (record.snapshotFrame !== undefined) {
    window.cancelAnimationFrame(record.snapshotFrame);
    record.snapshotFrame = undefined;
  }
  if (record.snapshotTimeout !== undefined) {
    window.clearTimeout(record.snapshotTimeout);
    record.snapshotTimeout = undefined;
  }
}

function queueTerminalOutput(record: TerminalRecord, data: string): void {
  if (record.disposed) {
    return;
  }

  record.outputChunks.push(data);
  record.outputBytes += data.length;
  trimTerminalOutputBuffer(record);
  scheduleTerminalOutputDrain(record);
}

function scheduleTerminalOutputDrain(record: TerminalRecord): void {
  if (record.disposed || record.outputWriteInProgress || record.outputFlushFrame !== undefined) {
    return;
  }

  record.outputFlushFrame = window.requestAnimationFrame(() => {
    record.outputFlushFrame = undefined;
    drainTerminalOutput(record);
  });
}

function drainTerminalOutput(record: TerminalRecord): void {
  if (record.disposed || record.outputWriteInProgress || record.outputBytes <= 0) {
    return;
  }

  const output = takeTerminalOutputChunk(record);
  if (!output) {
    return;
  }

  record.outputWriteInProgress = true;
  record.terminal.write(output, () => {
    record.outputWriteInProgress = false;
    scheduleTerminalSnapshotAfterIdle(record);
    if (record.outputBytes > 0) {
      scheduleTerminalOutputDrain(record);
    }
  });
}

function takeTerminalOutputChunk(record: TerminalRecord): string {
  const parts: string[] = [];
  let remaining = MAX_TERMINAL_WRITE_CHUNK;

  if (record.outputDroppedBytes > 0) {
    const notice = `\r\n[pui skipped ${record.outputDroppedBytes} bytes of terminal output]\r\n`;
    parts.push(notice);
    remaining = Math.max(0, remaining - notice.length);
    record.outputDroppedBytes = 0;
  }

  while (remaining > 0 && record.outputChunks.length > 0) {
    const first = record.outputChunks[0];
    if (first.length <= remaining) {
      parts.push(first);
      record.outputChunks.shift();
      record.outputBytes -= first.length;
      remaining -= first.length;
      continue;
    }

    let end = remaining;
    const lastCodeUnit = first.charCodeAt(end - 1);
    if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
      end -= 1;
    }
    if (end <= 0) {
      break;
    }

    parts.push(first.slice(0, end));
    record.outputChunks[0] = first.slice(end);
    record.outputBytes -= end;
    remaining = 0;
  }

  return parts.join("");
}

function trimTerminalOutputBuffer(record: TerminalRecord): void {
  while (record.outputBytes > MAX_TERMINAL_OUTPUT_BUFFER && record.outputChunks.length > 0) {
    const first = record.outputChunks[0];
    const overflow = record.outputBytes - MAX_TERMINAL_OUTPUT_BUFFER;
    if (first.length <= overflow) {
      record.outputChunks.shift();
      record.outputBytes -= first.length;
      record.outputDroppedBytes += first.length;
      continue;
    }

    record.outputChunks[0] = first.slice(overflow);
    record.outputBytes -= overflow;
    record.outputDroppedBytes += overflow;
  }
}

function scheduleTerminalSnapshotAfterIdle(record: TerminalRecord): void {
  if (!record.onSnapshot || record.disposed) {
    return;
  }

  if (record.snapshotTimeout !== undefined) {
    window.clearTimeout(record.snapshotTimeout);
  }

  record.snapshotTimeout = window.setTimeout(() => {
    record.snapshotTimeout = undefined;
    if (Date.now() - record.lastSnapshotAt < TERMINAL_SNAPSHOT_INTERVAL_MS) {
      return;
    }
    if (record.snapshotFrame !== undefined) {
      return;
    }
    record.snapshotFrame = window.requestAnimationFrame(() => {
      record.snapshotFrame = undefined;
      captureTerminalSnapshot(record);
    });
  }, TERMINAL_SNAPSHOT_IDLE_MS);
}

function captureTerminalSnapshot(record: TerminalRecord): void {
  if (!record.onSnapshot || record.disposed) {
    return;
  }

  const content = readTerminalSnapshotContent(record.terminal);
  if (!content) {
    return;
  }

  record.lastSnapshotAt = Date.now();
  record.onSnapshot({
    content,
    capturedAt: new Date().toISOString()
  });
}

function readTerminalSnapshotContent(terminal: Terminal): string {
  const buffer = terminal.buffer.normal;
  const start = Math.max(0, buffer.length - MAX_TERMINAL_SNAPSHOT_LINES);
  const lines: string[] = [];

  for (let index = start; index < buffer.length; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? "");
  }

  const content = lines.join("\n").trimEnd();
  return content.length > MAX_TERMINAL_SNAPSHOT_CHARS
    ? content.slice(content.length - MAX_TERMINAL_SNAPSHOT_CHARS)
    : content;
}

function scheduleFitAndResize(record: TerminalRecord): void {
  if (record.fitFrame !== undefined) {
    return;
  }

  record.fitFrame = window.requestAnimationFrame(() => {
    record.fitFrame = undefined;
    try {
      record.fit.fit();
    } catch {
      // xterm can report incomplete dimensions during first layout in browser preview.
    }
    resizeTerminalIfNeeded(record);
  });
}

function resizeTerminalIfNeeded(record: TerminalRecord): void {
  if (!record.sessionId || record.terminal.cols <= 0 || record.terminal.rows <= 0) {
    return;
  }

  const cols = record.terminal.cols;
  const rows = record.terminal.rows;
  if (record.lastResize?.cols === cols && record.lastResize.rows === rows) {
    return;
  }

  record.lastResize = { cols, rows };
  void pui.terminal.resize(record.sessionId, cols, rows);
}

function applyTerminalAppearance(terminal: Terminal, theme: ITheme, fontSize: number): void {
  terminal.options.theme = theme;
  if (terminal.options.fontSize !== fontSize) {
    terminal.options.fontSize = fontSize;
  }
  window.requestAnimationFrame(() => {
    terminal.refresh(0, Math.max(0, terminal.rows - 1));
  });
}
