import { type MouseEvent, useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import { X } from "lucide-react";
import type { ConsoleProfile } from "../../../shared/types";
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
  onContextMenu: (event: MouseEvent) => void;
};

type TerminalRecord = {
  terminal: Terminal;
  fit: FitAddon;
  sessionId?: string;
  inputDisposable: { dispose: () => void };
  shortcutHandler: { current: ((event: KeyboardEvent) => boolean) | undefined };
  outputBuffer: string;
  outputFlushFrame?: number;
  fitFrame?: number;
  lastResize?: { cols: number; rows: number };
  exited: boolean;
};

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
  onContextMenu
}: TerminalPaneProps) {
  const xtermMountRef = useRef<HTMLDivElement | null>(null);
  const recordRef = useRef<TerminalRecord | null>(null);
  const onSessionRef = useRef(onSession);
  const shortcutActionsRef = useRef({ canClose, onClose, onSplitRight, onSplitDown });

  useEffect(() => {
    onSessionRef.current = onSession;
  });

  useEffect(() => {
    shortcutActionsRef.current = { canClose, onClose, onSplitRight, onSplitDown };
  });

  useEffect(() => {
    if (!xtermMountRef.current) {
      return;
    }

    const record = getOrCreateTerminalRecord(
      workspaceId,
      pane.id,
      pane.sessionId,
      profile,
      active,
      terminalTheme,
      (sessionId) => {
        onSessionRef.current(sessionId);
      }
    );
    recordRef.current = record;
    record.shortcutHandler.current = (event) => {
      const actions = shortcutActionsRef.current;
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
    record.terminal.options.cursorBlink = active;
    applyTerminalAppearance(record.terminal, terminalTheme, terminalFontSize);
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
      if (recordRef.current === record) {
        record.shortcutHandler.current = undefined;
      }
      detachTerminalElement(record.terminal, mount);
      recordRef.current = null;
    };
  }, [active, pane.id, pane.sessionId, profile, terminalFontSize, terminalTheme, terminalThemeKey, workspaceId]);

  useEffect(() => {
    if (recordRef.current) {
      recordRef.current.terminal.options.cursorBlink = active;
      if (active) {
        recordRef.current.terminal.focus();
      }
    }
  }, [active]);

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

function getOrCreateTerminalRecord(
  workspaceId: string,
  paneId: string,
  existingSessionId: string | undefined,
  profile: ConsoleProfile,
  active: boolean,
  terminalTheme: ITheme,
  onSession: (sessionId: string) => void
): TerminalRecord {
  const key = terminalRecordKey(workspaceId, paneId);
  const existing = terminalRecords.get(key);
  if (existing) {
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

  let record: TerminalRecord;
  record = {
    terminal,
    fit,
    shortcutHandler,
    inputDisposable: terminal.onData((data) => {
      if (record.sessionId) {
        void pui.terminal.write(record.sessionId, data);
      }
    }),
    outputBuffer: "",
    exited: false
  };

  terminalRecords.set(key, record);
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

function cancelPendingTerminalWork(record: TerminalRecord): void {
  if (record.outputFlushFrame !== undefined) {
    window.cancelAnimationFrame(record.outputFlushFrame);
    record.outputFlushFrame = undefined;
  }
  if (record.fitFrame !== undefined) {
    window.cancelAnimationFrame(record.fitFrame);
    record.fitFrame = undefined;
  }
}

function queueTerminalOutput(record: TerminalRecord, data: string): void {
  record.outputBuffer += data;
  if (record.outputFlushFrame !== undefined) {
    return;
  }

  record.outputFlushFrame = window.requestAnimationFrame(() => {
    record.outputFlushFrame = undefined;
    const output = record.outputBuffer;
    record.outputBuffer = "";
    if (output) {
      record.terminal.write(output);
    }
  });
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
