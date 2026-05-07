import {
  Fragment,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Edit3, GitCompare, PanelRight, PanelTop, Play, Plus, Save, Settings, TerminalSquare, Trash2, X } from "lucide-react";
import type {
  AppSettings,
  ConsoleProfile,
  GitStatus,
  LayoutPreset,
  QuickCommand,
  TerminalWorkspace,
  WorkbenchNode,
  WorkbenchPane
} from "../../shared/types";
import { createQuickCommandProfile, normalizeWorkspaceWorkflow } from "../../shared/workflow";
import { CommandPalette } from "./components/CommandPalette";
import { ContextMenu } from "./components/ContextMenu";
import { GitPanel } from "./components/DiffPanel";
import { SettingsModal } from "./components/SettingsModal";
import { disposeTerminalPane, disposeTerminalPanes, moveTerminalPaneRecord, TerminalPane } from "./components/TerminalPane";
import { useContextMenu } from "./components/useContextMenu";
import { getPuiApi } from "./lib/browserApi";

type Pane = WorkbenchPane & {
  sessionId?: string;
};

const newId = () => crypto.randomUUID();
const pui = getPuiApi();
const isWindows = pui.platform === "win32";
const RESIZER_SIZE = 5;
const SIDEBAR_WIDTH_KEY = "pui.sidebarWidth";
const GIT_PANEL_WIDTH_KEY = "pui.gitPanelWidth";

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [layoutRoot, setLayoutRoot] = useState<WorkbenchNode | null>(null);
  const [sessionsByWorkspace, setSessionsByWorkspace] = useState<Record<string, Record<string, string>>>({});
  const [activePaneId, setActivePaneId] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gitSidebarOpen, setGitSidebarOpen] = useState(true);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredNumber(SIDEBAR_WIDTH_KEY, 224));
  const [gitPanelWidth, setGitPanelWidth] = useState(() => readStoredNumber(GIT_PANEL_WIDTH_KEY, 460));
  const didHydrateRef = useRef(false);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  const workspaces = settings?.workspaces ?? [];
  const quickTerminals = workspaces.filter((workspace) => workspace.kind === "quick");
  const folderWorkspaces = workspaces.filter((workspace) => workspace.kind !== "quick");
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const activeFolderTitle = activeWorkspace ? (activeWorkspace.kind === "quick" ? activeWorkspace.name : basename(activeWorkspace.path)) : "";
  const activeFolderSubtitle =
    activeWorkspace?.kind === "quick"
      ? "Quick terminal"
      : activeWorkspace && activeWorkspace.name !== activeFolderTitle
      ? `${activeWorkspace.name} · ${activeWorkspace.path}`
      : activeWorkspace?.path ?? "";
  const profiles = activeWorkspace?.profiles ?? [];
  const panes = useMemo(() => (layoutRoot ? collectPanes(layoutRoot) : []), [layoutRoot]);
  const activeWorkspaceSessions = activeWorkspace ? sessionsByWorkspace[activeWorkspace.id] ?? {} : {};
  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const gitSidebarVisible = Boolean(activeWorkspace?.kind !== "quick" && gitStatus?.isRepo && gitSidebarOpen);

  useEffect(() => {
    void pui.settings.load().then(async (loaded) => {
      const normalized = normalizeSettings(loaded);
      const initialWorkspace =
        normalized.workspaces?.find((workspace) => workspace.id === normalized.activeWorkspaceId) ?? normalized.workspaces?.[0];
      setSettings(normalized);
      if (initialWorkspace) {
        hydrateWorkspace(initialWorkspace);
        setActiveWorkspaceId(initialWorkspace.id);
        await refreshGit(initialWorkspace.path);
        await pui.git.watch(initialWorkspace.path);
      }
      didHydrateRef.current = true;
      if (!loaded.workspaces) {
        await pui.settings.save(normalized);
      }
    });

    const offGit = pui.git.onChanged(({ workspace }) => {
      void refreshGit(workspace);
    });
    return () => {
      offGit();
    };
  }, []);

  useEffect(() => {
    if (!settings || !activeWorkspace || !didHydrateRef.current || !layoutRoot) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistWorkspaceLayout(settings, activeWorkspace.id, layoutRoot, activePaneId);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [activePaneId, activeWorkspace, layoutRoot, settings]);

  const refreshGit = useCallback(async (workspacePath: string) => {
    const status = await pui.git.status(workspacePath);
    setGitStatus(status);
  }, []);

  const hydrateWorkspace = (workspace: TerminalWorkspace) => {
    const firstProfile = workspace.profiles[0];
    const validProfileIds = new Set(workspace.profiles.map((profile) => profile.id));
    const root = normalizeLayoutRoot(workspace.layout, firstProfile?.id, validProfileIds);
    const nextPanes = collectPanes(root);
    setLayoutRoot(root);
    setActivePaneId(nextPanes.some((pane) => pane.id === workspace.layout.activePaneId) ? workspace.layout.activePaneId : nextPanes[0].id);
  };

  const switchWorkspace = async (workspace: TerminalWorkspace) => {
    if (settings && activeWorkspace && layoutRoot) {
      const saved = await persistWorkspaceLayout(settings, activeWorkspace.id, layoutRoot, activePaneId);
      setSettings(saved);
    }
    setActiveWorkspaceId(workspace.id);
    hydrateWorkspace(workspace);
    if (workspace.kind === "quick") {
      setGitStatus(null);
    } else {
      await refreshGit(workspace.path);
      await pui.git.watch(workspace.path);
    }
    setPaletteOpen(false);
    closeContextMenu();
  };

  const applyWorkspaceLayout = useCallback((root: WorkbenchNode, nextActivePaneId: string) => {
    setLayoutRoot(root);
    setActivePaneId(nextActivePaneId);
    setSettings((current) =>
      current && activeWorkspace
        ? updateWorkspaceLayoutInSettings(current, activeWorkspace.id, root, nextActivePaneId)
        : current
    );
  }, [activeWorkspace]);

  const splitPaneById = useCallback((paneIdToSplit: string, direction: "right" | "down" = "right") => {
    if (!layoutRoot) {
      return;
    }
    const paneId = newId();
    const paneToSplit = panes.find((pane) => pane.id === paneIdToSplit);
    const nextRoot = splitPane(layoutRoot, paneIdToSplit, direction, { id: paneId, profileId: paneToSplit?.profileId ?? profiles[0]?.id });
    applyWorkspaceLayout(nextRoot, paneId);
  }, [applyWorkspaceLayout, layoutRoot, panes, profiles]);

  const splitActivePane = useCallback((direction: "right" | "down" = "right") => {
    splitPaneById(activePaneId, direction);
  }, [activePaneId, splitPaneById]);

  const splitPaneWithProfile = useCallback((paneIdToSplit: string, direction: "right" | "down", profile: ConsoleProfile) => {
    if (!layoutRoot || !activeWorkspace) {
      return;
    }
    const paneId = newId();
    const nextRoot = splitPane(layoutRoot, paneIdToSplit, direction, { id: paneId, profileId: profile.id });
    const nextWorkspace = {
      ...activeWorkspace,
      profiles: [...activeWorkspace.profiles.filter((item) => item.id !== profile.id), profile],
      layout: {
        activePaneId: paneId,
        root: nextRoot
      }
    };
    setSettings((current) =>
      current
        ? {
            ...current,
            workspaces: (current.workspaces ?? []).map((workspace) => (workspace.id === activeWorkspace.id ? nextWorkspace : workspace))
          }
        : current
    );
    setLayoutRoot(nextRoot);
    setActivePaneId(paneId);
  }, [activeWorkspace, layoutRoot]);

  const closePane = useCallback((paneId: string) => {
    if (!layoutRoot || panes.length <= 1) {
      return;
    }
    const nextRoot = removePane(layoutRoot, paneId);
    if (!nextRoot) {
      return;
    }
    const nextPanes = collectPanes(nextRoot);
    if (activeWorkspace) {
      disposeTerminalPane(activeWorkspace.id, paneId);
    }
    const nextActivePaneId = paneId === activePaneId ? nextPanes[0].id : activePaneId;
    applyWorkspaceLayout(nextRoot, nextActivePaneId);
    if (activeWorkspace) {
      setSessionsByWorkspace((current) => {
        const workspaceSessions = { ...(current[activeWorkspace.id] ?? {}) };
        delete workspaceSessions[paneId];
        return { ...current, [activeWorkspace.id]: workspaceSessions };
      });
    }
  }, [activePaneId, activeWorkspace, applyWorkspaceLayout, layoutRoot, panes.length]);

  const resizeSplit = useCallback((splitId: string, sizes: number[]) => {
    if (!layoutRoot) {
      return;
    }
    applyWorkspaceLayout(updateSplitSizes(layoutRoot, splitId, sizes), activePaneId);
  }, [activePaneId, applyWorkspaceLayout, layoutRoot]);

  const startSidebarResize = (event: ReactPointerEvent<HTMLElement>) => {
    startPanelResize(event, {
      initialValue: sidebarWidth,
      min: 176,
      max: 360,
      calculate: (initialValue, deltaX) => initialValue + deltaX,
      onChange: (width) => {
        setSidebarWidth(width);
        writeStoredNumber(SIDEBAR_WIDTH_KEY, width);
      }
    });
  };

  const startGitPanelResize = (event: ReactPointerEvent<HTMLElement>) => {
    startPanelResize(event, {
      initialValue: gitPanelWidth,
      min: 340,
      max: Math.min(760, Math.max(360, window.innerWidth - sidebarWidth - 280)),
      calculate: (initialValue, deltaX) => initialValue - deltaX,
      onChange: (width) => {
        setGitPanelWidth(width);
        writeStoredNumber(GIT_PANEL_WIDTH_KEY, width);
      }
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (event.metaKey && !event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        splitActivePane("right");
        return;
      }
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        splitActivePane("down");
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [splitActivePane]);

  const openFolder = async () => {
    if (!settings) {
      return;
    }
    const path = await pui.dialog.openFolder(activeWorkspace?.defaultCwd || activeWorkspace?.path || settings.workspace);
    if (path) {
      await createWorkspace({ path });
    }
  };

  const createQuickTerminal = async () => {
    if (!settings) {
      return;
    }

    const cwd = activeWorkspace?.defaultCwd || activeWorkspace?.path || settings.workspace;
    const profile = createShellProfile(cwd, "");
    const paneId = newId();
    const quickTerminal: TerminalWorkspace = {
      id: newId(),
      name: `Terminal ${quickTerminals.length + 1}`,
      kind: "quick",
      path: cwd,
      defaultCwd: cwd,
      terminalFontSize: activeWorkspace?.terminalFontSize || 13,
      profiles: [profile],
      layout: {
        activePaneId: paneId,
        root: { type: "pane", id: paneId, profileId: profile.id }
      },
      layoutPresets: [],
      quickCommands: []
    };

    const nextSettings = {
      ...settings,
      activeWorkspaceId: quickTerminal.id,
      workspaces: [quickTerminal, ...(settings.workspaces ?? [])]
    };
    const saved = await pui.settings.save(nextSettings);
    setSettings(normalizeSettings(saved));
    setActiveWorkspaceId(quickTerminal.id);
    hydrateWorkspace(quickTerminal);
    setGitStatus(null);
  };

  const createWorkspace = async ({ name, path }: { name?: string; path: string }) => {
    if (!settings) {
      return;
    }

    const defaultCwd = path.trim();
    const profile = createShellProfile(defaultCwd, "CmdOrCtrl+1");
    const paneId = newId();
    const workspace: TerminalWorkspace = {
      id: newId(),
      name: name?.trim() || basename(defaultCwd),
      kind: "folder",
      path: defaultCwd,
      defaultCwd,
      terminalFontSize: 13,
      profiles: [profile],
      layout: {
        activePaneId: paneId,
        root: { type: "pane", id: paneId, profileId: profile.id }
      },
      layoutPresets: [],
      quickCommands: []
    };

    const nextSettings = {
      ...settings,
      workspace: defaultCwd,
      activeWorkspaceId: workspace.id,
      workspaces: [...(settings.workspaces ?? []), workspace],
      recentWorkspaces: Array.from(new Set([defaultCwd, ...settings.recentWorkspaces])).slice(0, 12)
    };

    const saved = await pui.settings.save(nextSettings);
    setSettings(saved);
    setActiveWorkspaceId(workspace.id);
    hydrateWorkspace(workspace);
    await refreshGit(defaultCwd);
    await pui.git.watch(defaultCwd);
  };

  const startRenameWorkspace = (workspace: TerminalWorkspace) => {
    setEditingWorkspaceId(workspace.id);
    setEditingWorkspaceName(workspace.name);
    closeContextMenu();
  };

  const renameWorkspace = async (workspace: TerminalWorkspace, nextName: string) => {
    if (!settings) {
      return;
    }
    const trimmedName = nextName.trim();
    setEditingWorkspaceId(null);
    if (!trimmedName || trimmedName === workspace.name) {
      return;
    }
    const renamedWorkspace = { ...workspace, name: trimmedName };
    const nextSettings = {
      ...settings,
      workspaces: (settings.workspaces ?? []).map((item) => (item.id === workspace.id ? renamedWorkspace : item))
    };
    const saved = await pui.settings.save(nextSettings);
    setSettings(normalizeSettings(saved));
    closeContextMenu();
  };

  const saveCurrentLayoutPreset = async () => {
    if (!settings || !activeWorkspace || activeWorkspace.kind === "quick" || !layoutRoot) {
      return;
    }
    const name = window.prompt("Preset name", `Layout ${(activeWorkspace.layoutPresets ?? []).length + 1}`)?.trim();
    if (!name) {
      return;
    }
    const now = new Date().toISOString();
    const existing = activeWorkspace.layoutPresets?.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
    const preset: LayoutPreset = {
      id: existing?.id ?? newId(),
      name,
      description: existing?.description,
      root: cloneWorkbenchNode(layoutRoot),
      activePaneId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    const nextWorkspace = {
      ...activeWorkspace,
      layoutPresets: [...(activeWorkspace.layoutPresets ?? []).filter((item) => item.id !== preset.id), preset]
    };
    await updateActiveWorkspace(nextWorkspace);
  };

  const applyLayoutPreset = async (preset: LayoutPreset) => {
    if (!activeWorkspace) {
      return;
    }
    const cloned = cloneWorkbenchNodeWithNewIds(preset.root, preset.activePaneId);
    disposeTerminalPanes(activeWorkspace.id, collectPanes(layoutRoot ?? activeWorkspace.layout.root).map((pane) => pane.id));
    setSessionsByWorkspace((current) => ({ ...current, [activeWorkspace.id]: {} }));
    applyWorkspaceLayout(cloned.root, cloned.activePaneId);
  };

  const runQuickCommand = useCallback((command: QuickCommand) => {
    if (!activeWorkspace || activeWorkspace.kind === "quick") {
      return;
    }
    const profile = createQuickCommandProfile(command, activeWorkspace, newId);
    splitPaneWithProfile(activePaneId, command.splitDirection, profile);
  }, [activePaneId, activeWorkspace, splitPaneWithProfile]);

  const deleteWorkspace = async (workspaceId: string) => {
    if (!settings) {
      return;
    }
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const label = workspace?.kind === "quick" ? "quick terminal" : "folder";
    if (!workspace || !window.confirm(`Remove ${label} "${workspace.name}" from Pui? Terminal sessions for this ${label} will be closed.`)) {
      return;
    }

    disposeTerminalPanes(workspace.id, collectPanes(workspace.layout.root).map((pane) => pane.id));
    const remainingWorkspaces = workspaces.filter((item) => item.id !== workspace.id);
    const nextActiveWorkspace = workspace.id === activeWorkspace?.id ? remainingWorkspaces[0] : activeWorkspace;
    const nextSettings = {
      ...settings,
      activeWorkspaceId: nextActiveWorkspace?.id,
      workspace: nextActiveWorkspace?.path ?? settings.workspace,
      workspaces: remainingWorkspaces
    };
    const saved = await pui.settings.save(nextSettings);
    setSettings(saved);
    setSessionsByWorkspace((current) => {
      const next = { ...current };
      delete next[workspace.id];
      return next;
    });
    if (nextActiveWorkspace) {
      setActiveWorkspaceId(nextActiveWorkspace.id);
      hydrateWorkspace(nextActiveWorkspace);
      if (nextActiveWorkspace.kind === "quick") {
        setGitStatus(null);
      } else {
        await refreshGit(nextActiveWorkspace.path);
        await pui.git.watch(nextActiveWorkspace.path);
      }
    } else {
      setActiveWorkspaceId("");
      setLayoutRoot(null);
      setActivePaneId("");
      setGitStatus(null);
      setGitSidebarOpen(true);
    }
    closeContextMenu();
  };

  const attachQuickTerminalToFolder = async (quickTerminalId: string, folderId: string) => {
    if (!settings || quickTerminalId === folderId) {
      return;
    }
    const quickTerminal = workspaces.find((workspace) => workspace.id === quickTerminalId && workspace.kind === "quick");
    const folder = workspaces.find((workspace) => workspace.id === folderId && workspace.kind !== "quick");
    if (!quickTerminal || !folder) {
      return;
    }

    const quickPanes = collectPanes(quickTerminal.layout.root);
    const folderProfileIds = new Set(folder.profiles.map((profile) => profile.id));
    const movedProfiles = quickTerminal.profiles.map((profile) =>
      folderProfileIds.has(profile.id) ? { ...profile, id: newId(), shortcut: "" } : { ...profile, shortcut: "" }
    );
    const profileIdMap = new Map(quickTerminal.profiles.map((profile, index) => [profile.id, movedProfiles[index]?.id ?? profile.id]));
    const movedRoot = remapProfileIds(quickTerminal.layout.root, profileIdMap);
    const nextRoot = appendWorkbenchNode(folder.layout.root, movedRoot, "down");
    const nextFolder: TerminalWorkspace = {
      ...folder,
      profiles: [...folder.profiles, ...movedProfiles],
      layout: {
        activePaneId: quickTerminal.layout.activePaneId,
        root: nextRoot
      }
    };
    const nextSettings = {
      ...settings,
      activeWorkspaceId: folder.id,
      workspaces: workspaces
        .filter((workspace) => workspace.id !== quickTerminal.id)
        .map((workspace) => (workspace.id === folder.id ? nextFolder : workspace))
    };

    quickPanes.forEach((pane) => moveTerminalPaneRecord(quickTerminal.id, folder.id, pane.id));
    setSessionsByWorkspace((current) => {
      const quickSessions = current[quickTerminal.id] ?? {};
      const folderSessions = current[folder.id] ?? {};
      const next = { ...current };
      delete next[quickTerminal.id];
      next[folder.id] = { ...folderSessions, ...quickSessions };
      return next;
    });

    const saved = await pui.settings.save(nextSettings);
    setSettings(normalizeSettings(saved));
    setActiveWorkspaceId(folder.id);
    hydrateWorkspace(nextFolder);
    await refreshGit(folder.path);
    await pui.git.watch(folder.path);
  };

  const updateActiveWorkspace = async (workspace: TerminalWorkspace) => {
    if (!settings) {
      return;
    }
    const nextSettings = {
      ...settings,
      workspace: workspace.path,
      recentWorkspaces: Array.from(new Set([workspace.path, ...settings.recentWorkspaces])).slice(0, 12),
      workspaces: (settings.workspaces ?? []).map((item) => (item.id === workspace.id ? workspace : item))
    };
    const saved = await pui.settings.save(nextSettings);
    const normalized = normalizeSettings(saved);
    setSettings(normalized);
    setActiveWorkspaceId(workspace.id);
    hydrateWorkspace(workspace);
    if (workspace.kind === "quick") {
      setGitStatus(null);
    } else {
      await refreshGit(workspace.path);
      await pui.git.watch(workspace.path);
    }
  };

  const openWorkspaceContextMenu = (event: MouseEvent, workspace: TerminalWorkspace) => {
    openContextMenu(event, [
      {
        id: "open-workspace",
        label: workspace.kind === "quick" ? "Open terminal" : "Open folder",
        onSelect: () => void switchWorkspace(workspace)
      },
      {
        id: "rename-workspace",
        label: "Rename label",
        icon: <Edit3 size={14} />,
        onSelect: () => startRenameWorkspace(workspace)
      },
      {
        id: "delete-workspace",
        label: workspace.kind === "quick" ? "Close terminal" : "Close folder",
        icon: <Trash2 size={14} />,
        destructive: true,
        onSelect: () => void deleteWorkspace(workspace.id)
      }
    ]);
  };

  const openPaneContextMenu = (event: MouseEvent, paneId: string) => {
    setActivePaneId(paneId);
    openContextMenu(event, [
      {
        id: "split-right",
        label: "Split right",
        shortcut: "Cmd D",
        icon: <PanelRight size={14} />,
        onSelect: () => splitPaneById(paneId, "right")
      },
      {
        id: "split-down",
        label: "Split down",
        shortcut: "Shift Cmd D",
        icon: <PanelTop size={14} />,
        onSelect: () => splitPaneById(paneId, "down")
      },
      {
        id: "close-pane",
        label: panes.length <= 1 ? "Cannot close last pane" : "Close pane",
        shortcut: "Cmd W",
        icon: <X size={14} />,
        destructive: true,
        disabled: panes.length <= 1,
        onSelect: () => closePane(paneId)
      }
    ]);
  };

  if (!settings) {
    return <div className="boot">loading shell</div>;
  }

  return (
    <div className="app-shell" style={{ gridTemplateColumns: `${sidebarWidth}px ${RESIZER_SIZE}px minmax(0, 1fr)` }}>
      <aside className="sidebar">
        <div className="brand">
          <TerminalSquare size={18} />
          <span>Pui</span>
        </div>

        <div className="sidebar-label">Terminals</div>
        <section className="workspace-list quick-terminal-list">
          {quickTerminals.map((terminal) =>
            terminal.id === editingWorkspaceId ? (
              <div key={terminal.id} className="workspace-button quick active editing" title="Quick terminal">
                <span>QT</span>
                <input
                  className="workspace-rename-input"
                  autoFocus
                  value={editingWorkspaceName}
                  onChange={(event) => setEditingWorkspaceName(event.target.value)}
                  onBlur={() => void renameWorkspace(terminal, editingWorkspaceName)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      setEditingWorkspaceId(null);
                      setEditingWorkspaceName("");
                    }
                  }}
                />
              </div>
            ) : (
              <button
                key={terminal.id}
                type="button"
                draggable
                className={terminal.id === activeWorkspace?.id ? "workspace-button quick active" : "workspace-button quick"}
                title="Drag onto a folder to group this terminal"
                onClick={() => switchWorkspace(terminal)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-pui-quick-terminal", terminal.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onContextMenu={(event) => openWorkspaceContextMenu(event, terminal)}
              >
                <span>QT</span>
                <strong>{terminal.name}</strong>
              </button>
            )
          )}
          <button className="workspace-button quick-create" type="button" onClick={() => void createQuickTerminal()}>
            <span>+</span>
            <strong>Quick terminal</strong>
          </button>
        </section>

        <div className="sidebar-label">Folders</div>
        <section className="workspace-list">
          {folderWorkspaces.map((workspace) =>
            workspace.id === editingWorkspaceId ? (
              <div key={workspace.id} className="workspace-button active editing" title={workspace.path}>
                <span>{editingWorkspaceName.slice(0, 2).toUpperCase() || "FO"}</span>
                <input
                  className="workspace-rename-input"
                  autoFocus
                  value={editingWorkspaceName}
                  onChange={(event) => setEditingWorkspaceName(event.target.value)}
                  onBlur={() => void renameWorkspace(workspace, editingWorkspaceName)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      setEditingWorkspaceId(null);
                      setEditingWorkspaceName("");
                    }
                  }}
                />
              </div>
            ) : (
              <button
                key={workspace.id}
                type="button"
                className={workspace.id === activeWorkspace?.id ? "workspace-button active" : "workspace-button"}
                title={workspace.path}
                onClick={() => switchWorkspace(workspace)}
                onContextMenu={(event) => openWorkspaceContextMenu(event, workspace)}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes("application/x-pui-quick-terminal")) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  const quickTerminalId = event.dataTransfer.getData("application/x-pui-quick-terminal");
                  if (quickTerminalId) {
                    event.preventDefault();
                    void attachQuickTerminalToFolder(quickTerminalId, workspace.id);
                  }
                }}
              >
                <span>{workspace.name.slice(0, 2).toUpperCase()}</span>
                <strong>{workspace.name}</strong>
              </button>
            )
          )}
        </section>

        <div className="new-profile">
          <button type="button" onClick={() => void openFolder()}>
            <Plus size={14} />
            <span>Open folder</span>
          </button>
          <button
            className={settingsOpen ? "active" : ""}
            type="button"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={14} />
            <span>Settings</span>
          </button>
        </div>
      </aside>
      <div
        className="app-resizer app-sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        title="Resize sidebar"
        onPointerDown={startSidebarResize}
      />

      <main className="workbench">
        <header className="workspace-topbar">
          <div className="workspace-topbar-title">
            <strong>{activeWorkspace ? activeFolderTitle : "No folder open"}</strong>
            <span>{activeWorkspace ? activeFolderSubtitle : "Open a folder to start a terminal session"}</span>
          </div>
          <div className="workspace-topbar-actions">
            <button type="button" title="Open folder" onClick={() => void openFolder()}>
              <Plus size={14} />
              <span>Folder</span>
            </button>
            {activeWorkspace ? (
              <>
                <button type="button" title="Split right" onClick={() => splitActivePane("right")}>
                  <PanelRight size={14} />
                  <span>Split</span>
                </button>
                {activeWorkspace.kind !== "quick" && gitStatus?.isRepo ? (
                  <button
                    type="button"
                    className={gitSidebarVisible ? "active" : ""}
                    title="Git"
                    onClick={() => setGitSidebarOpen((current) => !current)}
                  >
                    <GitCompare size={14} />
                    <span>Git</span>
                    {gitStatus.files.length ? <small>{gitStatus.files.length}</small> : null}
                  </button>
                ) : null}
                {activeWorkspace.kind !== "quick" ? (
                  <>
                    <button type="button" title="Save layout preset" onClick={() => void saveCurrentLayoutPreset()}>
                      <Save size={14} />
                      <span>Save layout</span>
                    </button>
                    {(activeWorkspace.quickCommands ?? []).map((command) => (
                      <button key={command.id} type="button" title={command.name} onClick={() => runQuickCommand(command)}>
                        <Play size={14} />
                        <span>{command.name}</span>
                      </button>
                    ))}
                  </>
                ) : null}
              </>
            ) : null}
            <button type="button" className={settingsOpen ? "active" : ""} title="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings size={14} />
            </button>
          </div>
        </header>
        <div
          className="content-row"
          style={{
            gridTemplateColumns:
              activeWorkspace && gitSidebarVisible
                ? `minmax(0, 1fr) ${RESIZER_SIZE}px ${gitPanelWidth}px`
                : "minmax(0, 1fr)"
          }}
        >
          {activeWorkspace && layoutRoot ? (
            <section className="terminal-grid">
            <PaneTree
              node={layoutRoot}
              profilesById={profilesById}
              fallbackProfile={profiles[0]}
              workspaceName={activeFolderTitle}
              terminalFontSize={activeWorkspace.terminalFontSize}
              activePaneId={activePaneId}
              workspaceId={activeWorkspace.id}
              showHeaders={true}
              canClosePanes={panes.length > 1}
              sessionsByPane={activeWorkspaceSessions}
              onFocus={setActivePaneId}
              onClosePane={closePane}
              onPaneContextMenu={openPaneContextMenu}
              onResizeSplit={resizeSplit}
              onSession={(paneId, sessionId) =>
                setSessionsByWorkspace((current) => {
                  const workspaceSessions = current[activeWorkspace.id] ?? {};
                  if (workspaceSessions[paneId] === sessionId) {
                    return current;
                  }
                  return {
                    ...current,
                    [activeWorkspace.id]: {
                      ...workspaceSessions,
                      [paneId]: sessionId
                    }
                  };
                })
              }
            />
            </section>
          ) : (
            <section className="empty-workbench">
              <TerminalSquare size={28} />
              <strong>No folders open</strong>
              <span>Open a folder to create a workspace-specific terminal layout.</span>
              <button type="button" onClick={() => void openFolder()}>
                <Plus size={14} />
                Open folder
              </button>
            </section>
          )}

          {activeWorkspace && gitSidebarVisible ? (
            <>
            <div
              className="app-resizer side-panel-resizer"
              role="separator"
              aria-orientation="vertical"
              title="Resize Git panel"
              onPointerDown={startGitPanelResize}
            />
            <aside className="workspace-side-panel">
              <GitPanel workspace={activeWorkspace.path} status={gitStatus} onStatus={setGitStatus} />
            </aside>
            </>
          ) : null}
        </div>
      </main>

      {paletteOpen ? (
        <CommandPalette
          workspaces={workspaces}
          onClose={() => setPaletteOpen(false)}
          onOpenWorkspace={switchWorkspace}
          onSplitRight={() => splitActivePane("right")}
          onSplitDown={() => splitActivePane("down")}
          layoutPresets={activeWorkspace?.kind !== "quick" ? activeWorkspace?.layoutPresets ?? [] : []}
          quickCommands={activeWorkspace?.kind !== "quick" ? activeWorkspace?.quickCommands ?? [] : []}
          onSaveLayoutPreset={() => void saveCurrentLayoutPreset()}
          onApplyLayoutPreset={(preset) => void applyLayoutPreset(preset)}
          onRunQuickCommand={runQuickCommand}
          showGit={Boolean(activeWorkspace && gitStatus?.isRepo)}
          onShowGit={() => setGitSidebarOpen(true)}
        />
      ) : null}

      {settingsOpen && activeWorkspace ? (
        <SettingsModal
          settings={settings}
          activeWorkspace={activeWorkspace}
          onWorkspaceChange={updateActiveWorkspace}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {contextMenu ? <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={closeContextMenu} /> : null}
    </div>
  );
}

async function persistWorkspaceLayout(
  settings: AppSettings,
  workspaceId: string,
  root: WorkbenchNode,
  activePaneId: string
): Promise<AppSettings> {
  return pui.settings.save(updateWorkspaceLayoutInSettings(settings, workspaceId, root, activePaneId));
}

function updateWorkspaceLayoutInSettings(
  settings: AppSettings,
  workspaceId: string,
  root: WorkbenchNode,
  activePaneId: string
): AppSettings {
  return {
    ...settings,
    activeWorkspaceId: workspaceId,
    workspaces: (settings.workspaces ?? []).map((workspace) =>
      workspace.id === workspaceId
        ? {
            ...workspace,
            layout: {
              activePaneId,
              root
            }
          }
        : workspace
    )
  };
}

function startPanelResize(
  event: ReactPointerEvent<HTMLElement>,
  options: {
    initialValue: number;
    min: number;
    max: number;
    calculate: (initialValue: number, deltaX: number, deltaY: number) => number;
    onChange: (value: number) => void;
  }
) {
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startY = event.clientY;
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  document.body.style.cursor = event.currentTarget.getAttribute("aria-orientation") === "horizontal" ? "row-resize" : "col-resize";
  document.body.style.userSelect = "none";

  const onMove = (moveEvent: PointerEvent) => {
    const nextValue = options.calculate(options.initialValue, moveEvent.clientX - startX, moveEvent.clientY - startY);
    options.onChange(clamp(nextValue, options.min, options.max));
  };

  const onUp = () => {
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
}

function readStoredNumber(key: string, fallback: number): number {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function writeStoredNumber(key: string, value: number) {
  window.localStorage.setItem(key, String(Math.round(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSplitSizes(sizes: number[] | undefined, childCount: number): number[] {
  if (childCount <= 0) {
    return [];
  }
  const normalized = Array.from({ length: childCount }, (_, index) => {
    const value = sizes?.[index];
    return Number.isFinite(value) && value && value > 0 ? value : 1;
  });
  const total = normalized.reduce((sum, value) => sum + value, 0);
  return total > 0 ? normalized.map((value) => value / total) : Array.from({ length: childCount }, () => 1 / childCount);
}

function buildSplitTracks(sizes: number[]): string {
  return sizes.map((size, index) => `${size}fr${index < sizes.length - 1 ? ` ${RESIZER_SIZE}px` : ""}`).join(" ");
}

function resizeAdjacentSplitSizes(sizes: number[], boundaryIndex: number, deltaPixels: number, dimensionPixels: number): number[] {
  if (dimensionPixels <= 0 || boundaryIndex < 0 || boundaryIndex >= sizes.length - 1) {
    return sizes;
  }

  const next = [...sizes];
  const pairTotal = next[boundaryIndex] + next[boundaryIndex + 1];
  const deltaSize = deltaPixels / dimensionPixels;
  const minSize = Math.min(0.35, pairTotal * 0.18);
  next[boundaryIndex] = clamp(next[boundaryIndex] + deltaSize, minSize, pairTotal - minSize);
  next[boundaryIndex + 1] = pairTotal - next[boundaryIndex];
  return next;
}

function updateSplitSizes(root: WorkbenchNode, splitId: string, sizes: number[]): WorkbenchNode {
  if (root.type === "pane") {
    return root;
  }
  if (root.id === splitId) {
    return { ...root, sizes: normalizeSplitSizes(sizes, root.children.length) };
  }
  return {
    ...root,
    children: root.children.map((child) => updateSplitSizes(child, splitId, sizes))
  };
}

function appendWorkbenchNode(root: WorkbenchNode, child: WorkbenchNode, direction: "right" | "down"): WorkbenchNode {
  if (root.type === "split" && root.direction === direction) {
    const children = [...root.children, child];
    return {
      ...root,
      children,
      sizes: normalizeSplitSizes([...(root.sizes ?? []), 1], children.length)
    };
  }

  return {
    type: "split",
    id: newId(),
    direction,
    children: [root, child],
    sizes: [0.65, 0.35]
  };
}

function remapProfileIds(root: WorkbenchNode, profileIdMap: Map<string, string>): WorkbenchNode {
  if (root.type === "pane") {
    return {
      ...root,
      profileId: root.profileId ? profileIdMap.get(root.profileId) ?? root.profileId : root.profileId
    };
  }
  return {
    ...root,
    children: root.children.map((child) => remapProfileIds(child, profileIdMap))
  };
}

function cloneWorkbenchNode(root: WorkbenchNode): WorkbenchNode {
  if (root.type === "pane") {
    return { ...root };
  }
  return {
    ...root,
    sizes: root.sizes ? [...root.sizes] : undefined,
    children: root.children.map(cloneWorkbenchNode)
  };
}

function cloneWorkbenchNodeWithNewIds(root: WorkbenchNode, activePaneId: string): { root: WorkbenchNode; activePaneId: string } {
  const idMap = new Map<string, string>();
  const clone = (node: WorkbenchNode): WorkbenchNode => {
    const id = newId();
    idMap.set(node.id, id);
    if (node.type === "pane") {
      return { ...node, id };
    }
    return {
      ...node,
      id,
      sizes: node.sizes ? [...node.sizes] : undefined,
      children: node.children.map(clone)
    };
  };
  const clonedRoot = clone(root);
  const firstPane = collectPanes(clonedRoot)[0]?.id ?? clonedRoot.id;
  return { root: clonedRoot, activePaneId: idMap.get(activePaneId) ?? firstPane };
}

function normalizeSettings(settings: AppSettings): AppSettings {
  if (settings.workspaces) {
    const workspaces = settings.workspaces.map((workspace) => normalizeWorkspaceWorkflow({
      ...workspace,
      kind: workspace.kind ?? ("folder" as const),
      defaultCwd: workspace.defaultCwd || workspace.path,
      terminalFontSize: workspace.terminalFontSize || 13,
      profiles: workspace.profiles.map((profile) => ({
        ...profile,
        cwd: profile.cwd || workspace.defaultCwd || workspace.path
      }))
    }));
    const activeWorkspaceId = workspaces.some((workspace) => workspace.id === settings.activeWorkspaceId)
      ? settings.activeWorkspaceId
      : workspaces[0]?.id;
    return { ...settings, activeWorkspaceId, workspaces };
  }

  const path = settings.workspace;
  const profiles = settings.profiles.length > 0 ? settings.profiles : [createShellProfile(path, "CmdOrCtrl+1")];
  const paneId = newId();
  const workspace: TerminalWorkspace = {
    id: "main-workspace",
    name: basename(path) || "workspace",
    kind: "folder",
    path,
    defaultCwd: path,
    terminalFontSize: 13,
    profiles: profiles.map((profile, index) => ({ ...profile, cwd: path, shortcut: `CmdOrCtrl+${index + 1}` })),
    layout: {
      activePaneId: paneId,
      root: { type: "pane", id: paneId, profileId: profiles[0]?.id }
    },
    layoutPresets: [],
    quickCommands: []
  };

  return {
    ...settings,
    activeWorkspaceId: workspace.id,
    workspaces: [workspace]
  };
}

function PaneTree({
  node,
  profilesById,
  fallbackProfile,
  workspaceName,
  terminalFontSize,
  workspaceId,
  activePaneId,
  showHeaders,
  canClosePanes,
  sessionsByPane,
  onFocus,
  onClosePane,
  onPaneContextMenu,
  onResizeSplit,
  onSession
}: {
  node: WorkbenchNode;
  profilesById: Map<string, ConsoleProfile>;
  fallbackProfile?: ConsoleProfile;
  workspaceName: string;
  terminalFontSize?: number;
  workspaceId: string;
  activePaneId: string;
  showHeaders: boolean;
  canClosePanes: boolean;
  sessionsByPane: Record<string, string>;
  onFocus: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onPaneContextMenu: (event: MouseEvent, paneId: string) => void;
  onResizeSplit: (splitId: string, sizes: number[]) => void;
  onSession: (paneId: string, sessionId: string) => void;
}) {
  const splitRef = useRef<HTMLDivElement | null>(null);

  if (node.type === "split") {
    const sizes = normalizeSplitSizes(node.sizes, node.children.length);
    const tracks = buildSplitTracks(sizes);
    const gridStyle =
      node.direction === "right"
        ? { gridTemplateColumns: tracks }
        : { gridTemplateRows: tracks };

    const startSplitResize = (event: ReactPointerEvent<HTMLElement>, boundaryIndex: number) => {
      const container = splitRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const dimension = node.direction === "right" ? rect.width : rect.height;
      const startSizes = normalizeSplitSizes(node.sizes, node.children.length);
      startPanelResize(event, {
        initialValue: 0,
        min: -Infinity,
        max: Infinity,
        calculate: (_initialValue, deltaX, deltaY) => (node.direction === "right" ? deltaX : deltaY),
        onChange: (delta) => {
          onResizeSplit(node.id, resizeAdjacentSplitSizes(startSizes, boundaryIndex, delta, dimension));
        }
      });
    };

    return (
      <div ref={splitRef} className={`pane-split ${node.direction === "right" ? "horizontal" : "vertical"}`} style={gridStyle}>
        {node.children.map((child, index) => (
          <Fragment key={child.id}>
            <PaneTree
              node={child}
              profilesById={profilesById}
              fallbackProfile={fallbackProfile}
              workspaceName={workspaceName}
              terminalFontSize={terminalFontSize}
              workspaceId={workspaceId}
              activePaneId={activePaneId}
              showHeaders={showHeaders}
              canClosePanes={canClosePanes}
              sessionsByPane={sessionsByPane}
              onFocus={onFocus}
              onClosePane={onClosePane}
              onPaneContextMenu={onPaneContextMenu}
              onResizeSplit={onResizeSplit}
              onSession={onSession}
            />
            {index < node.children.length - 1 ? (
              <div
                key={`${node.id}-${index}-resizer`}
                className={`pane-resizer ${node.direction === "right" ? "vertical" : "horizontal"}`}
                role="separator"
                aria-orientation={node.direction === "right" ? "vertical" : "horizontal"}
                title="Resize terminal pane"
                onPointerDown={(event) => startSplitResize(event, index)}
              />
            ) : null}
          </Fragment>
        ))}
      </div>
    );
  }

  const profile = node.profileId ? profilesById.get(node.profileId) : fallbackProfile;
  if (!profile) {
    return null;
  }

  return (
    <TerminalPane
      pane={{ id: node.id, profileId: node.profileId, sessionId: sessionsByPane[node.id] }}
      workspaceId={workspaceId}
      profile={profile}
      workspaceName={workspaceName}
      terminalFontSize={terminalFontSize}
      active={node.id === activePaneId}
      showHeader={showHeaders}
      canClose={canClosePanes}
      onFocus={() => onFocus(node.id)}
      onClose={() => onClosePane(node.id)}
      onContextMenu={(event) => onPaneContextMenu(event, node.id)}
      onSession={(sessionId) => onSession(node.id, sessionId)}
    />
  );
}

function normalizeLayoutRoot(
  layout: TerminalWorkspace["layout"],
  fallbackProfileId: string | undefined,
  validProfileIds: Set<string>
): WorkbenchNode {
  if (layout.root) {
    return normalizeNode(layout.root, fallbackProfileId, validProfileIds);
  }

  const panes = layout.panes && layout.panes.length > 0 ? layout.panes : [{ id: newId(), profileId: fallbackProfileId }];
  const normalizedPanes = panes.map((pane) => ({
    type: "pane" as const,
    id: pane.id || newId(),
    profileId: pane.profileId && validProfileIds.has(pane.profileId) ? pane.profileId : fallbackProfileId
  }));

  if (normalizedPanes.length === 1) {
    return normalizedPanes[0];
  }

  return {
    type: "split",
    id: newId(),
    direction: layout.direction ?? "right",
    children: normalizedPanes,
    sizes: normalizeSplitSizes(undefined, normalizedPanes.length)
  };
}

function normalizeNode(node: WorkbenchNode, fallbackProfileId: string | undefined, validProfileIds: Set<string>): WorkbenchNode {
  if (node.type === "pane") {
    return {
      ...node,
      id: node.id || newId(),
      profileId: node.profileId && validProfileIds.has(node.profileId) ? node.profileId : fallbackProfileId
    };
  }

  const children = node.children.map((child) => normalizeNode(child, fallbackProfileId, validProfileIds)).filter(Boolean);
  if (children.length === 1) {
    return children[0];
  }
  return { ...node, id: node.id || newId(), children, sizes: normalizeSplitSizes(node.sizes, children.length) };
}

function collectPanes(node: WorkbenchNode): WorkbenchPane[] {
  if (node.type === "pane") {
    return [{ id: node.id, profileId: node.profileId }];
  }
  return node.children.flatMap(collectPanes);
}

function splitPane(root: WorkbenchNode, targetPaneId: string, direction: "right" | "down", newPane: WorkbenchPane): WorkbenchNode {
  if (root.type === "pane") {
    if (root.id !== targetPaneId) {
      return root;
    }
    return {
      type: "split",
      id: newId(),
      direction,
      children: [root, { type: "pane", id: newPane.id, profileId: newPane.profileId }],
      sizes: [0.5, 0.5]
    };
  }

  return {
    ...root,
    children: root.children.map((child) => splitPane(child, targetPaneId, direction, newPane))
  };
}

function removePane(root: WorkbenchNode, targetPaneId: string): WorkbenchNode | null {
  if (root.type === "pane") {
    return root.id === targetPaneId ? null : root;
  }

  const previousSizes = normalizeSplitSizes(root.sizes, root.children.length);
  const retained = root.children
    .map((child, index) => ({ child: removePane(child, targetPaneId), size: previousSizes[index] }))
    .filter((item): item is { child: WorkbenchNode; size: number } => Boolean(item.child));
  const children = retained.map((item) => item.child);
  if (children.length === 0) {
    return null;
  }
  if (children.length === 1) {
    return children[0];
  }
  return { ...root, children, sizes: normalizeSplitSizes(retained.map((item) => item.size), children.length) };
}

function createShellProfile(path: string, shortcut: string): ConsoleProfile {
  const shell = defaultShellProfile();
  return {
    id: newId(),
    name: shell.name,
    cwd: path,
    command: shell.command,
    args: shell.args,
    env: {},
    shortcut,
    appearance: {
      color: "#9ca3af",
      icon: "terminal"
    }
  };
}

function defaultShellProfile(): { name: string; command: string; args: string[] } {
  if (isWindows) {
    return { name: "PowerShell", command: "powershell.exe", args: ["-NoLogo"] };
  }
  return { name: "zsh", command: "/bin/zsh", args: [] };
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
