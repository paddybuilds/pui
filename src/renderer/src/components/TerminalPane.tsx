import { type MouseEvent, useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
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
  offData: () => void;
  offExit: () => void;
  shortcutHandler: { current: ((event: KeyboardEvent) => boolean) | undefined };
  exited: boolean;
};

const terminalRecords = new Map<string, TerminalRecord>();
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
  record.offData();
  record.offExit();
  if (record.sessionId && !record.exited) {
    void pui.terminal.kill(record.sessionId);
  }
  record.terminal.dispose();
  terminalRecords.delete(key);
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
  const containerRef = useRef<HTMLDivElement | null>(null);
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

    const record = getOrCreateTerminalRecord(workspaceId, pane.id, pane.sessionId, profile, active, (sessionId) => {
      onSessionRef.current(sessionId);
    });
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
    if (record.terminal.options.fontSize !== terminalFontSize) {
      record.terminal.options.fontSize = terminalFontSize;
    }
    fitTerminal(record.fit);
    if (record.sessionId) {
      onSessionRef.current(record.sessionId);
      void pui.terminal.resize(record.sessionId, record.terminal.cols, record.terminal.rows);
    }

    const observer = new ResizeObserver(() => {
      fitTerminal(record.fit);
      if (record.sessionId) {
        void pui.terminal.resize(record.sessionId, record.terminal.cols, record.terminal.rows);
      }
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
  }, [active, pane.id, pane.sessionId, profile, terminalFontSize, workspaceId]);

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
      <div className="terminal-host" ref={containerRef} onMouseDown={focusPane}>
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
  onSession: (sessionId: string) => void
): TerminalRecord {
  const key = terminalRecordKey(workspaceId, paneId);
  const existing = terminalRecords.get(key);
  if (existing) {
    if (existingSessionId && !existing.sessionId) {
      existing.sessionId = existingSessionId;
    }
    return existing;
  }

  const terminal = new Terminal({
    cursorBlink: active,
    convertEol: true,
    fontFamily: "Geist Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.25,
    theme: {
      background: "#111318",
      foreground: "#e8edf2",
      cursor: "#e5e7eb",
      selectionBackground: "#334155"
    }
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  const shortcutHandler: TerminalRecord["shortcutHandler"] = { current: undefined };
  terminal.attachCustomKeyEventHandler((event) => shortcutHandler.current?.(event) ?? true);

  const record: TerminalRecord = {
    terminal,
    fit,
    sessionId: existingSessionId,
    shortcutHandler,
    inputDisposable: terminal.onData((data) => {
      if (record.sessionId) {
        void pui.terminal.write(record.sessionId, data);
      }
    }),
    offData: pui.terminal.onData(({ sessionId, data }) => {
      if (sessionId === record.sessionId) {
        record.terminal.write(data);
      }
    }),
    offExit: pui.terminal.onExit(({ sessionId, exitCode }) => {
      if (sessionId === record.sessionId && !record.exited) {
        record.exited = true;
        record.terminal.writeln("");
        record.terminal.writeln(`[process exited with code ${exitCode}]`);
      }
    }),
    exited: false
  };

  terminalRecords.set(key, record);

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
        record.sessionId = session.id;
        onSession(session.id);
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

function fitTerminal(fit: FitAddon): void {
  window.requestAnimationFrame(() => {
    try {
      fit.fit();
    } catch {
      // xterm can report incomplete dimensions during first layout in browser preview.
    }
  });
}
