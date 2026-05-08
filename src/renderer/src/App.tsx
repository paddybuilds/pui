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
import type { ITheme } from "@xterm/xterm";
import {
  Edit3,
  Files,
  GitCompare,
  PanelRight,
  PanelTop,
  Play,
  Plus,
  Settings,
  TerminalSquare,
  Trash2,
  Wrench,
  X
} from "lucide-react";
import type {
  AppSettings,
  ConsoleProfile,
  FileSystemEntry,
  GitStatus,
  LayoutPreset,
  QuickCommand,
  TerminalPaneSnapshot,
  TerminalWorkspace,
  WorkbenchNode
} from "../../shared/types";
import { createQuickCommandProfile } from "../../shared/workflow";
import { CommandPalette } from "./components/CommandPalette";
import { CodeWorkspace } from "./components/CodeWorkspace";
import { ContextMenu } from "./components/ContextMenu";
import { DevSettingsModal } from "./components/DevSettingsModal";
import { GitPanel } from "./components/DiffPanel";
import { FileExplorerPanel } from "./components/FileExplorerPanel";
import { OnboardingPanel } from "./components/OnboardingPanel";
import { SettingsModal } from "./components/SettingsModal";
import {
  disposeTerminalPane,
  disposeTerminalPanes,
  moveTerminalPaneRecord,
  TerminalPane
} from "./components/TerminalPane";
import { useContextMenu } from "./components/useContextMenu";
import { getPuiApi } from "./lib/browserApi";
import {
  type CodeFileTab,
  type WorkspaceView,
  createLoadedCodeTab,
  createLoadingCodeTab,
  markCodeTabError,
  markCodeTabSaved,
  nextActiveCodeTabPath,
  updateCodeTabContents,
  upsertCodeTab
} from "./lib/codeWorkspace";
import { getDevToolsFlagState } from "./lib/devFlags";
import { matchesShortcut, shortcutLabel } from "./lib/shortcuts";
import { applyThemePreferences, readTitleBarTheme, resolveTerminalTheme, themeKey } from "./lib/theme";
import {
  appendWorkbenchNode,
  buildSplitTracks,
  clamp,
  cloneWorkbenchNode,
  cloneWorkbenchNodeWithNewIds,
  collectPanes,
  normalizeLayoutRoot,
  normalizeSplitSizes,
  remapProfileIds,
  removePane,
  resizeAdjacentSplitSizes,
  splitPane,
  updateSplitSizes,
  updateWorkspaceLayoutInSettings
} from "./lib/workbenchLayout";
import { basename, createShellProfile, normalizeAppPreferences, normalizeSettings } from "./lib/workspaceSettings";

const newId = () => crypto.randomUUID();
const pui = getPuiApi();
const RESIZER_SIZE = 5;
const SIDEBAR_WIDTH_KEY = "pui.sidebarWidth";
const GIT_PANEL_WIDTH_KEY = "pui.gitPanelWidth";
type WorkspaceSidePanel = "files" | "git";

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [layoutRoot, setLayoutRoot] = useState<WorkbenchNode | null>(null);
  const [sessionsByWorkspace, setSessionsByWorkspace] = useState<Record<string, Record<string, string>>>({});
  const [activePaneId, setActivePaneId] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devSettingsOpen, setDevSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingDismissible, setOnboardingDismissible] = useState(false);
  const [activeSidePanel, setActiveSidePanel] = useState<WorkspaceSidePanel | null>("git");
  const [activeWorkspaceView, setActiveWorkspaceView] = useState<WorkspaceView>("terminal");
  const [codeTabsByWorkspace, setCodeTabsByWorkspace] = useState<Record<string, CodeFileTab[]>>({});
  const [activeCodePathByWorkspace, setActiveCodePathByWorkspace] = useState<Record<string, string | undefined>>({});
  const [workspaceFilePathsByWorkspace, setWorkspaceFilePathsByWorkspace] = useState<Record<string, string[]>>({});
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredNumber(SIDEBAR_WIDTH_KEY, 224));
  const [gitPanelWidth, setGitPanelWidth] = useState(() => readStoredNumber(GIT_PANEL_WIDTH_KEY, 360));
  const didHydrateRef = useRef(false);
  const terminalSnapshotsRef = useRef<Record<string, Record<string, TerminalPaneSnapshot>>>({});
  const terminalSnapshotSaveTimeoutRef = useRef<number>();
  const workspaceFilePathCacheRef = useRef<Record<string, string[]>>({});
  const activeGitWorkspaceRef = useRef<string | null>(null);
  const gitRefreshRequestRef = useRef(0);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
  const devToolsFlagState = useMemo(() => getDevToolsFlagState(), []);
  const devToolsEnabled = devToolsFlagState.enabled;

  const workspaces = settings?.workspaces ?? [];
  const quickTerminals = workspaces.filter((workspace) => workspace.kind === "quick");
  const folderWorkspaces = workspaces.filter((workspace) => workspace.kind !== "quick");
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const activeFolderTitle = activeWorkspace
    ? activeWorkspace.kind === "quick"
      ? activeWorkspace.name
      : basename(activeWorkspace.path)
    : "";
  const activeFolderSubtitle =
    activeWorkspace?.kind === "quick"
      ? "Quick terminal"
      : activeWorkspace && activeWorkspace.name !== activeFolderTitle
        ? `${activeWorkspace.name} · ${activeWorkspace.path}`
        : (activeWorkspace?.path ?? "");
  const profiles = useMemo(() => activeWorkspace?.profiles ?? [], [activeWorkspace?.profiles]);
  const panes = useMemo(() => (layoutRoot ? collectPanes(layoutRoot) : []), [layoutRoot]);
  const activeWorkspaceSessions = activeWorkspace ? (sessionsByWorkspace[activeWorkspace.id] ?? {}) : {};
  const activeCodeTabs = activeWorkspace ? (codeTabsByWorkspace[activeWorkspace.id] ?? []) : [];
  const activeCodePath = activeWorkspace ? activeCodePathByWorkspace[activeWorkspace.id] : undefined;
  const activeWorkspaceFilePaths = activeWorkspace ? (workspaceFilePathsByWorkspace[activeWorkspace.id] ?? []) : [];
  const activeFileIndexWorkspaceId = activeWorkspace?.kind === "quick" ? undefined : activeWorkspace?.id;
  const activeFileIndexWorkspacePath = activeWorkspace?.kind === "quick" ? undefined : activeWorkspace?.path;
  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const fileExplorerVisible = Boolean(activeWorkspace?.kind !== "quick" && activeSidePanel === "files");
  const gitSidebarVisible = Boolean(
    activeWorkspace?.kind !== "quick" && gitStatus?.isRepo && activeSidePanel === "git"
  );
  const sidePanelVisible = fileExplorerVisible || gitSidebarVisible;
  const appPreferences = useMemo(
    () => normalizeAppPreferences(settings?.appPreferences, { defaultTerminalProfileId: settings?.profiles[0]?.id }),
    [settings?.appPreferences, settings?.profiles]
  );
  const activeWorkspaceSnapshots =
    activeWorkspace && appPreferences.resumeTerminalSessions
      ? (terminalSnapshotsRef.current[activeWorkspace.id] ?? {})
      : {};
  const terminalThemeKey = useMemo(() => themeKey(appPreferences), [appPreferences]);
  const terminalTheme = useMemo(() => resolveTerminalTheme(appPreferences), [appPreferences]);

  const refreshGit = useCallback(async (workspacePath: string) => {
    const activeGitWorkspace = activeGitWorkspaceRef.current;
    if (activeGitWorkspace !== workspacePath) {
      return;
    }

    const requestId = ++gitRefreshRequestRef.current;
    const status = await pui.git.status(workspacePath);
    const nextActiveGitWorkspace = activeGitWorkspaceRef.current;
    if (nextActiveGitWorkspace !== workspacePath || requestId !== gitRefreshRequestRef.current) {
      return;
    }
    setGitStatus((current) => (areGitStatusesEqual(current, status) ? current : status));
  }, []);

  const refreshWorkspaceGit = useCallback(
    async (workspacePath: string) => {
      try {
        await refreshGit(workspacePath);
        await pui.git.watch(workspacePath);
      } catch (error) {
        console.error("Failed to refresh workspace Git state", error);
        if (activeGitWorkspaceRef.current !== workspacePath) {
          return;
        }
        const status = {
          workspace: workspacePath,
          isRepo: false,
          files: [],
          error: error instanceof Error ? error.message : String(error)
        };
        setGitStatus((current) => (areGitStatusesEqual(current, status) ? current : status));
      }
    },
    [refreshGit]
  );

  const hydrateWorkspace = useCallback((workspace: TerminalWorkspace) => {
    const firstProfile = workspace.profiles[0];
    const validProfileIds = new Set(workspace.profiles.map((profile) => profile.id));
    const root = normalizeLayoutRoot(workspace.layout, firstProfile?.id, validProfileIds, newId);
    const nextPanes = collectPanes(root);
    setLayoutRoot(root);
    setActivePaneId(
      nextPanes.some((pane) => pane.id === workspace.layout.activePaneId)
        ? workspace.layout.activePaneId
        : nextPanes[0].id
    );
  }, []);

  const saveSettingsWithTerminalSnapshots = useCallback(async (nextSettings: AppSettings) => {
    const saved = await pui.settings.save({
      ...nextSettings,
      terminalSnapshots: terminalSnapshotsRef.current
    });
    terminalSnapshotsRef.current = saved.terminalSnapshots ?? terminalSnapshotsRef.current;
    return saved;
  }, []);

  useEffect(() => {
    void pui.settings.loadState().then(async ({ settings: loaded, isFirstLaunch }) => {
      const normalized = normalizeSettings(loaded, pui.platform, newId);
      const initialWorkspace =
        normalized.workspaces?.find((workspace) => workspace.id === normalized.activeWorkspaceId) ??
        normalized.workspaces?.[0];
      terminalSnapshotsRef.current = normalized.terminalSnapshots ?? {};
      setSettings(normalized);
      if (isFirstLaunch) {
        setOnboardingDismissible(false);
        setOnboardingOpen(true);
        return;
      }
      if (initialWorkspace) {
        activeGitWorkspaceRef.current = initialWorkspace.kind === "quick" ? null : initialWorkspace.path;
        hydrateWorkspace(initialWorkspace);
        setActiveWorkspaceId(initialWorkspace.id);
        if (initialWorkspace.kind === "quick") {
          setGitStatus(null);
        } else {
          void refreshWorkspaceGit(initialWorkspace.path);
        }
      }
      didHydrateRef.current = true;
      if (!loaded.workspaces) {
        await saveSettingsWithTerminalSnapshots(normalized);
      }
    });

    const offGit = pui.git.onChanged(({ workspace }) => {
      void refreshGit(workspace);
    });
    return () => {
      offGit();
    };
  }, [hydrateWorkspace, refreshGit, refreshWorkspaceGit, saveSettingsWithTerminalSnapshots]);

  useEffect(() => {
    applyThemePreferences(appPreferences);
    void pui.app.setTitleBarTheme(readTitleBarTheme());
  }, [appPreferences]);

  useEffect(
    () => () => {
      if (terminalSnapshotSaveTimeoutRef.current !== undefined) {
        window.clearTimeout(terminalSnapshotSaveTimeoutRef.current);
      }
    },
    []
  );

  const completeOnboarding = async (nextSettings: AppSettings) => {
    const normalized = normalizeSettings(nextSettings, pui.platform, newId);
    const saved = normalizeSettings(await saveSettingsWithTerminalSnapshots(normalized), pui.platform, newId);
    const initialWorkspace =
      saved.workspaces?.find((workspace) => workspace.id === saved.activeWorkspaceId) ?? saved.workspaces?.[0];
    setSettings(saved);
    if (initialWorkspace) {
      hydrateWorkspace(initialWorkspace);
      setActiveWorkspaceId(initialWorkspace.id);
      void refreshWorkspaceGit(initialWorkspace.path);
    }
    didHydrateRef.current = true;
    setOnboardingDismissible(false);
    setOnboardingOpen(false);
  };

  const openDevOnboarding = () => {
    setDevSettingsOpen(false);
    setSettingsOpen(false);
    setOnboardingDismissible(true);
    setOnboardingOpen(true);
  };

  const closeDevOnboarding = () => {
    setOnboardingOpen(false);
    setOnboardingDismissible(false);
  };

  const openReplayOnboarding = () => {
    setSettingsOpen(false);
    setDevSettingsOpen(false);
    setOnboardingDismissible(true);
    setOnboardingOpen(true);
  };

  useEffect(() => {
    activeGitWorkspaceRef.current = activeWorkspace?.kind === "quick" ? null : (activeWorkspace?.path ?? null);
  }, [activeWorkspace?.kind, activeWorkspace?.path]);

  useEffect(() => {
    if (!activeFileIndexWorkspaceId || !activeFileIndexWorkspacePath || !appPreferences.codeAutocompleteEnabled) {
      return;
    }
    const workspaceId = activeFileIndexWorkspaceId;
    const workspacePath = activeFileIndexWorkspacePath;
    const cachedPaths = workspaceFilePathCacheRef.current[workspaceId];
    if (cachedPaths) {
      setWorkspaceFilePathsByWorkspace((current) =>
        current[workspaceId] === cachedPaths ? current : { ...current, [workspaceId]: cachedPaths }
      );
      return;
    }
    let canceled = false;
    void pui.fileSystem
      .listFilePaths(workspacePath)
      .then((result) => {
        if (!canceled) {
          workspaceFilePathCacheRef.current = { ...workspaceFilePathCacheRef.current, [workspaceId]: result.paths };
          setWorkspaceFilePathsByWorkspace((current) => ({ ...current, [workspaceId]: result.paths }));
        }
      })
      .catch(() => {
        if (!canceled) {
          workspaceFilePathCacheRef.current = { ...workspaceFilePathCacheRef.current, [workspaceId]: [] };
          setWorkspaceFilePathsByWorkspace((current) => ({ ...current, [workspaceId]: [] }));
        }
      });
    return () => {
      canceled = true;
    };
  }, [activeFileIndexWorkspaceId, activeFileIndexWorkspacePath, appPreferences.codeAutocompleteEnabled]);

  useEffect(() => {
    if (!settings || !activeWorkspace || !didHydrateRef.current || !layoutRoot) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistWorkspaceLayout(settings, activeWorkspace.id, layoutRoot, activePaneId, terminalSnapshotsRef.current);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [activePaneId, activeWorkspace, layoutRoot, settings]);

  const updateTerminalSnapshot = useCallback(
    (workspaceId: string, paneId: string, snapshot: TerminalPaneSnapshot) => {
      if (!appPreferences.resumeTerminalSessions) {
        return;
      }

      const current = terminalSnapshotsRef.current;
      const workspaceSnapshots = current[workspaceId] ?? {};
      if (workspaceSnapshots[paneId]?.content === snapshot.content) {
        return;
      }

      terminalSnapshotsRef.current = {
        ...current,
        [workspaceId]: {
          ...workspaceSnapshots,
          [paneId]: snapshot
        }
      };
      scheduleTerminalSnapshotSave(terminalSnapshotsRef, terminalSnapshotSaveTimeoutRef);
    },
    [appPreferences.resumeTerminalSessions]
  );

  const switchWorkspace = async (workspace: TerminalWorkspace) => {
    if (settings && activeWorkspace && layoutRoot) {
      const saved = await persistWorkspaceLayout(
        settings,
        activeWorkspace.id,
        layoutRoot,
        activePaneId,
        terminalSnapshotsRef.current
      );
      setSettings(saved);
    }
    const previousGitWorkspace = activeGitWorkspaceRef.current;
    if (previousGitWorkspace && (workspace.kind === "quick" || previousGitWorkspace !== workspace.path)) {
      void pui.git.unwatch(previousGitWorkspace);
    }
    activeGitWorkspaceRef.current = workspace.kind === "quick" ? null : workspace.path;
    setActiveWorkspaceId(workspace.id);
    hydrateWorkspace(workspace);
    if (workspace.kind === "quick") {
      setActiveWorkspaceView("terminal");
      setGitStatus(null);
    } else {
      await refreshWorkspaceGit(workspace.path);
    }
    setPaletteOpen(false);
    closeContextMenu();
  };

  const openCodeFile = async (entry: FileSystemEntry) => {
    if (!activeWorkspace || activeWorkspace.kind === "quick" || entry.kind !== "file") {
      return;
    }
    const workspace = activeWorkspace;
    setActiveWorkspaceView("code");
    setCodeTabsByWorkspace((current) => ({
      ...current,
      [workspace.id]: upsertCodeTab(current[workspace.id] ?? [], createLoadingCodeTab(entry.path))
    }));
    setActiveCodePathByWorkspace((current) => ({ ...current, [workspace.id]: entry.path }));

    try {
      const file = await pui.fileSystem.readFile(workspace.path, entry.path);
      setCodeTabsByWorkspace((current) => ({
        ...current,
        [workspace.id]: upsertCodeTab(current[workspace.id] ?? [], createLoadedCodeTab(file))
      }));
    } catch (error) {
      setCodeTabsByWorkspace((current) => ({
        ...current,
        [workspace.id]: markCodeTabError(
          current[workspace.id] ?? [],
          entry.path,
          error instanceof Error ? error.message : String(error)
        )
      }));
    }
  };

  const updateCodeTab = (path: string, contents: string) => {
    if (!activeWorkspace) {
      return;
    }
    setCodeTabsByWorkspace((current) => ({
      ...current,
      [activeWorkspace.id]: updateCodeTabContents(current[activeWorkspace.id] ?? [], path, contents)
    }));
  };

  const saveCodeTab = async (path: string) => {
    if (!activeWorkspace || activeWorkspace.kind === "quick") {
      return;
    }
    const workspace = activeWorkspace;
    const tab = (codeTabsByWorkspace[workspace.id] ?? []).find((item) => item.path === path);
    if (!tab || tab.kind !== "text") {
      return;
    }
    try {
      const result = await pui.fileSystem.writeFile(workspace.path, path, tab.contents);
      setCodeTabsByWorkspace((current) => ({
        ...current,
        [workspace.id]: markCodeTabSaved(current[workspace.id] ?? [], path, result)
      }));
      void refreshWorkspaceGit(workspace.path);
    } catch (error) {
      setCodeTabsByWorkspace((current) => ({
        ...current,
        [workspace.id]: markCodeTabError(
          current[workspace.id] ?? [],
          path,
          error instanceof Error ? error.message : String(error)
        )
      }));
    }
  };

  const closeCodeTab = (path: string) => {
    if (!activeWorkspace) {
      return;
    }
    const workspaceId = activeWorkspace.id;
    setCodeTabsByWorkspace((current) => {
      const tabs = current[workspaceId] ?? [];
      return { ...current, [workspaceId]: tabs.filter((tab) => tab.path !== path) };
    });
    setActiveCodePathByWorkspace((current) => ({
      ...current,
      [workspaceId]: nextActiveCodeTabPath(codeTabsByWorkspace[workspaceId] ?? [], path, current[workspaceId])
    }));
  };

  const applyWorkspaceLayout = useCallback(
    (root: WorkbenchNode, nextActivePaneId: string) => {
      setLayoutRoot(root);
      setActivePaneId(nextActivePaneId);
      setSettings((current) =>
        current && activeWorkspace
          ? updateWorkspaceLayoutInSettings(current, activeWorkspace.id, root, nextActivePaneId)
          : current
      );
    },
    [activeWorkspace]
  );

  const splitPaneById = useCallback(
    (paneIdToSplit: string, direction: "right" | "down" = "right") => {
      if (!layoutRoot) {
        return;
      }
      const paneId = newId();
      const paneToSplit = panes.find((pane) => pane.id === paneIdToSplit);
      const nextRoot = splitPane(
        layoutRoot,
        paneIdToSplit,
        direction,
        { id: paneId, profileId: paneToSplit?.profileId ?? profiles[0]?.id },
        newId
      );
      applyWorkspaceLayout(nextRoot, paneId);
    },
    [applyWorkspaceLayout, layoutRoot, panes, profiles]
  );

  const splitActivePane = useCallback(
    (direction: "right" | "down" = "right") => {
      splitPaneById(activePaneId, direction);
    },
    [activePaneId, splitPaneById]
  );

  const splitPaneWithProfile = useCallback(
    (paneIdToSplit: string, direction: "right" | "down", profile: ConsoleProfile) => {
      if (!layoutRoot || !activeWorkspace) {
        return;
      }
      const paneId = newId();
      const nextRoot = splitPane(layoutRoot, paneIdToSplit, direction, { id: paneId, profileId: profile.id }, newId);
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
              workspaces: (current.workspaces ?? []).map((workspace) =>
                workspace.id === activeWorkspace.id ? nextWorkspace : workspace
              )
            }
          : current
      );
      setLayoutRoot(nextRoot);
      setActivePaneId(paneId);
    },
    [activeWorkspace, layoutRoot]
  );

  const closePane = useCallback(
    (paneId: string) => {
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
    },
    [activePaneId, activeWorkspace, applyWorkspaceLayout, layoutRoot, panes.length]
  );

  const resizeSplit = useCallback(
    (splitId: string, sizes: number[], commit = false) => {
      if (!layoutRoot) {
        return;
      }
      const nextRoot = updateSplitSizes(layoutRoot, splitId, sizes);
      if (commit) {
        applyWorkspaceLayout(nextRoot, activePaneId);
        return;
      }
      setLayoutRoot(nextRoot);
    },
    [activePaneId, applyWorkspaceLayout, layoutRoot]
  );

  const startSidebarResize = (event: ReactPointerEvent<HTMLElement>) => {
    startPanelResize(event, {
      initialValue: sidebarWidth,
      min: 176,
      max: 360,
      calculate: (initialValue, deltaX) => initialValue + deltaX,
      onChange: (width) => {
        setSidebarWidth(width);
      },
      onCommit: (width) => {
        writeStoredNumber(SIDEBAR_WIDTH_KEY, width);
      }
    });
  };

  const startGitPanelResize = (event: ReactPointerEvent<HTMLElement>) => {
    startPanelResize(event, {
      initialValue: gitPanelWidth,
      min: 320,
      max: Math.min(560, Math.max(360, Math.floor((window.innerWidth - sidebarWidth) * 0.42))),
      calculate: (initialValue, deltaX) => initialValue - deltaX,
      onChange: (width) => {
        setGitPanelWidth(width);
      },
      onCommit: (width) => {
        writeStoredNumber(GIT_PANEL_WIDTH_KEY, width);
      }
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target) && !matchesShortcut(event, "CmdOrCtrl+K")) {
        return;
      }
      if (matchesShortcut(event, "CmdOrCtrl+K")) {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (matchesShortcut(event, "CmdOrCtrl+D")) {
        event.preventDefault();
        splitActivePane("right");
        return;
      }
      if (matchesShortcut(event, "CmdOrCtrl+Shift+D")) {
        event.preventDefault();
        splitActivePane("down");
        return;
      }
      if (matchesShortcut(event, "CmdOrCtrl+W")) {
        event.preventDefault();
        closePane(activePaneId);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [activePaneId, closePane, splitActivePane]);

  const openFolder = async () => {
    if (!settings) {
      return;
    }
    try {
      const path = await pui.dialog.openFolder(
        activeWorkspace?.defaultCwd || activeWorkspace?.path || settings.workspace
      );
      if (path) {
        await createWorkspace({ path });
      }
    } catch (error) {
      console.error("Failed to open folder", error);
      window.alert(`Could not open that folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const createQuickTerminal = async () => {
    if (!settings) {
      return;
    }

    const cwd = activeWorkspace?.defaultCwd || activeWorkspace?.path || settings.workspace;
    const profile = createShellProfile(cwd, "", pui.platform, newId);
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
    const saved = await saveSettingsWithTerminalSnapshots(nextSettings);
    setSettings(normalizeSettings(saved, pui.platform, newId));
    if (activeGitWorkspaceRef.current) {
      void pui.git.unwatch(activeGitWorkspaceRef.current);
    }
    activeGitWorkspaceRef.current = null;
    setActiveWorkspaceId(quickTerminal.id);
    setActiveWorkspaceView("terminal");
    hydrateWorkspace(quickTerminal);
    setGitStatus(null);
  };

  const createWorkspace = async ({ name, path }: { name?: string; path: string }) => {
    if (!settings) {
      return;
    }

    const defaultCwd = path.trim();
    const profile = createShellProfile(defaultCwd, "CmdOrCtrl+1", pui.platform, newId);
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

    const saved = await saveSettingsWithTerminalSnapshots(nextSettings);
    setSettings(normalizeSettings(saved, pui.platform, newId));
    if (activeGitWorkspaceRef.current && activeGitWorkspaceRef.current !== workspace.path) {
      void pui.git.unwatch(activeGitWorkspaceRef.current);
    }
    activeGitWorkspaceRef.current = workspace.path;
    setActiveWorkspaceId(workspace.id);
    hydrateWorkspace(workspace);
    void refreshWorkspaceGit(defaultCwd);
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
    const saved = await saveSettingsWithTerminalSnapshots(nextSettings);
    setSettings(normalizeSettings(saved, pui.platform, newId));
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
    const cloned = cloneWorkbenchNodeWithNewIds(preset.root, preset.activePaneId, newId);
    disposeTerminalPanes(
      activeWorkspace.id,
      collectPanes(layoutRoot ?? activeWorkspace.layout.root).map((pane) => pane.id)
    );
    setSessionsByWorkspace((current) => ({ ...current, [activeWorkspace.id]: {} }));
    applyWorkspaceLayout(cloned.root, cloned.activePaneId);
  };

  const runQuickCommand = useCallback(
    (command: QuickCommand) => {
      if (!activeWorkspace || activeWorkspace.kind === "quick") {
        return;
      }
      const profile = createQuickCommandProfile(command, activeWorkspace, newId);
      splitPaneWithProfile(activePaneId, command.splitDirection, profile);
    },
    [activePaneId, activeWorkspace, splitPaneWithProfile]
  );

  const deleteWorkspace = async (workspaceId: string) => {
    if (!settings) {
      return;
    }
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const label = workspace?.kind === "quick" ? "quick terminal" : "folder";
    if (
      !workspace ||
      !window.confirm(
        `Remove ${label} "${workspace.name}" from Pui? Terminal sessions for this ${label} will be closed.`
      )
    ) {
      return;
    }

    disposeTerminalPanes(
      workspace.id,
      collectPanes(workspace.layout.root).map((pane) => pane.id)
    );
    if (workspace.kind !== "quick") {
      void pui.git.unwatch(workspace.path);
    }
    const remainingWorkspaces = workspaces.filter((item) => item.id !== workspace.id);
    const nextActiveWorkspace = workspace.id === activeWorkspace?.id ? remainingWorkspaces[0] : activeWorkspace;
    const nextSettings = {
      ...settings,
      activeWorkspaceId: nextActiveWorkspace?.id,
      workspace: nextActiveWorkspace?.path ?? settings.workspace,
      workspaces: remainingWorkspaces
    };
    const saved = await saveSettingsWithTerminalSnapshots(nextSettings);
    setSettings(saved);
    setSessionsByWorkspace((current) => {
      const next = { ...current };
      delete next[workspace.id];
      return next;
    });
    if (nextActiveWorkspace) {
      activeGitWorkspaceRef.current = nextActiveWorkspace.kind === "quick" ? null : nextActiveWorkspace.path;
      setActiveWorkspaceId(nextActiveWorkspace.id);
      hydrateWorkspace(nextActiveWorkspace);
      if (nextActiveWorkspace.kind === "quick") {
        setGitStatus(null);
      } else {
        await refreshWorkspaceGit(nextActiveWorkspace.path);
      }
    } else {
      activeGitWorkspaceRef.current = null;
      setActiveWorkspaceId("");
      setLayoutRoot(null);
      setActivePaneId("");
      setGitStatus(null);
      setActiveSidePanel("git");
    }
    closeContextMenu();
  };

  const attachQuickTerminalToFolder = async (quickTerminalId: string, folderId: string) => {
    if (!settings || quickTerminalId === folderId) {
      return;
    }
    const quickTerminal = workspaces.find(
      (workspace) => workspace.id === quickTerminalId && workspace.kind === "quick"
    );
    const folder = workspaces.find((workspace) => workspace.id === folderId && workspace.kind !== "quick");
    if (!quickTerminal || !folder) {
      return;
    }

    const quickPanes = collectPanes(quickTerminal.layout.root);
    const folderProfileIds = new Set(folder.profiles.map((profile) => profile.id));
    const movedProfiles = quickTerminal.profiles.map((profile) =>
      folderProfileIds.has(profile.id) ? { ...profile, id: newId(), shortcut: "" } : { ...profile, shortcut: "" }
    );
    const profileIdMap = new Map(
      quickTerminal.profiles.map((profile, index) => [profile.id, movedProfiles[index]?.id ?? profile.id])
    );
    const movedRoot = remapProfileIds(quickTerminal.layout.root, profileIdMap);
    const nextRoot = appendWorkbenchNode(folder.layout.root, movedRoot, "down", newId);
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

    const saved = await saveSettingsWithTerminalSnapshots(nextSettings);
    setSettings(normalizeSettings(saved, pui.platform, newId));
    activeGitWorkspaceRef.current = folder.path;
    setActiveWorkspaceId(folder.id);
    hydrateWorkspace(nextFolder);
    await refreshWorkspaceGit(folder.path);
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
    const saved = await saveSettingsWithTerminalSnapshots(nextSettings);
    const normalized = normalizeSettings(saved, pui.platform, newId);
    setSettings(normalized);
    if (
      activeGitWorkspaceRef.current &&
      (workspace.kind === "quick" || activeGitWorkspaceRef.current !== workspace.path)
    ) {
      void pui.git.unwatch(activeGitWorkspaceRef.current);
    }
    activeGitWorkspaceRef.current = workspace.kind === "quick" ? null : workspace.path;
    setActiveWorkspaceId(workspace.id);
    hydrateWorkspace(workspace);
    if (workspace.kind === "quick") {
      setGitStatus(null);
    } else {
      await refreshWorkspaceGit(workspace.path);
    }
  };

  const updateSettings = async (nextSettings: AppSettings) => {
    const saved = await saveSettingsWithTerminalSnapshots(nextSettings);
    const normalized = normalizeSettings(saved, pui.platform, newId);
    setSettings(normalized);
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
        shortcut: shortcutLabel("CmdOrCtrl+D", pui.platform),
        icon: <PanelRight size={14} />,
        onSelect: () => splitPaneById(paneId, "right")
      },
      {
        id: "split-down",
        label: "Split down",
        shortcut: shortcutLabel("CmdOrCtrl+Shift+D", pui.platform),
        icon: <PanelTop size={14} />,
        onSelect: () => splitPaneById(paneId, "down")
      },
      {
        id: "close-pane",
        label: panes.length <= 1 ? "Cannot close last pane" : "Close pane",
        shortcut: shortcutLabel("CmdOrCtrl+W", pui.platform),
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

  if (onboardingOpen) {
    return (
      <OnboardingPanel
        settings={settings}
        platform={pui.platform}
        onOpenFolder={pui.dialog.openFolder}
        onComplete={completeOnboarding}
        onCancel={onboardingDismissible ? closeDevOnboarding : undefined}
      />
    );
  }

  return (
    <div className="app-shell" style={{ gridTemplateColumns: `${sidebarWidth}px ${RESIZER_SIZE}px minmax(0, 1fr)` }}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-emoji" aria-hidden="true">
            💩
          </span>
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
                className={
                  terminal.id === activeWorkspace?.id ? "workspace-button quick active" : "workspace-button quick"
                }
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
          {devToolsEnabled ? (
            <button
              className={devSettingsOpen ? "active" : ""}
              type="button"
              title="Developer settings"
              onClick={() => {
                setSettingsOpen(false);
                setDevSettingsOpen(true);
              }}
            >
              <Wrench size={14} />
              <span>Dev</span>
            </button>
          ) : null}
          <button
            className={settingsOpen ? "active" : ""}
            type="button"
            title="Settings"
            onClick={() => {
              setDevSettingsOpen(false);
              setSettingsOpen(true);
            }}
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
          {activeWorkspace?.kind !== "quick" ? (
            <div className="workspace-view-switch" role="tablist" aria-label="Workspace view">
              <button
                type="button"
                role="tab"
                aria-selected={activeWorkspaceView === "terminal"}
                className={activeWorkspaceView === "terminal" ? "active" : ""}
                onClick={() => setActiveWorkspaceView("terminal")}
              >
                Terminal
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeWorkspaceView === "code"}
                className={activeWorkspaceView === "code" ? "active" : ""}
                onClick={() => setActiveWorkspaceView("code")}
              >
                Code
              </button>
            </div>
          ) : null}
          <div className="workspace-topbar-actions">
            {activeWorkspace ? (
              <>
                <button
                  type="button"
                  title="Split right"
                  aria-label="Split right"
                  onClick={() => splitActivePane("right")}
                >
                  <PanelRight size={14} />
                </button>
                {activeWorkspace.kind !== "quick" ? (
                  <button
                    type="button"
                    className={fileExplorerVisible ? "active" : ""}
                    title="Explorer"
                    aria-label="Explorer"
                    onClick={() => setActiveSidePanel((current) => (current === "files" ? null : "files"))}
                  >
                    <Files size={14} />
                  </button>
                ) : null}
                {activeWorkspace.kind !== "quick" && gitStatus?.isRepo ? (
                  <button
                    type="button"
                    className={gitSidebarVisible ? "active" : ""}
                    title="Git"
                    aria-label="Git"
                    onClick={() => setActiveSidePanel((current) => (current === "git" ? null : "git"))}
                  >
                    <GitCompare size={14} />
                    {gitStatus.files.length ? <small>{gitStatus.files.length}</small> : null}
                  </button>
                ) : null}
                {activeWorkspace.kind !== "quick"
                  ? (activeWorkspace.quickCommands ?? []).map((command) => (
                      <button
                        key={command.id}
                        type="button"
                        title={command.name}
                        aria-label={command.name}
                        onClick={() => runQuickCommand(command)}
                      >
                        <Play size={14} />
                      </button>
                    ))
                  : null}
              </>
            ) : null}
          </div>
        </header>
        <div
          className="content-row"
          style={{
            gridTemplateColumns:
              activeWorkspace && sidePanelVisible
                ? `minmax(0, 1fr) ${RESIZER_SIZE}px ${gitPanelWidth}px`
                : "minmax(0, 1fr)"
          }}
        >
          {activeWorkspace && layoutRoot ? (
            <section className="workspace-main-stack">
              {activeWorkspaceView === "terminal" ? (
                <div className="terminal-grid">
                  <PaneTree
                    node={layoutRoot}
                    profilesById={profilesById}
                    fallbackProfile={profiles[0]}
                    workspaceName={activeFolderTitle}
                    terminalFontSize={activeWorkspace.terminalFontSize}
                    terminalTheme={terminalTheme}
                    terminalThemeKey={terminalThemeKey}
                    activePaneId={activePaneId}
                    workspaceId={activeWorkspace.id}
                    showHeaders={panes.length > 1}
                    canClosePanes={panes.length > 1}
                    sessionsByPane={activeWorkspaceSessions}
                    snapshotsByPane={activeWorkspaceSnapshots}
                    onFocus={setActivePaneId}
                    onClosePane={closePane}
                    onPaneContextMenu={openPaneContextMenu}
                    onSplitPane={splitPaneById}
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
                    onSnapshot={(paneId, snapshot) => updateTerminalSnapshot(activeWorkspace.id, paneId, snapshot)}
                  />
                </div>
              ) : activeWorkspace.kind !== "quick" ? (
                <div className="code-grid">
                  <CodeWorkspace
                    platform={pui.platform}
                    autocompleteEnabled={appPreferences.codeAutocompleteEnabled}
                    workspaceFilePaths={activeWorkspaceFilePaths}
                    tabs={activeCodeTabs}
                    activePath={activeCodePath}
                    onActivate={(path) =>
                      setActiveCodePathByWorkspace((current) => ({ ...current, [activeWorkspace.id]: path }))
                    }
                    onChange={updateCodeTab}
                    onSave={saveCodeTab}
                    onClose={closeCodeTab}
                  />
                </div>
              ) : null}
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

          {activeWorkspace && sidePanelVisible ? (
            <>
              <div
                className="app-resizer side-panel-resizer"
                role="separator"
                aria-orientation="vertical"
                title="Resize side panel"
                onPointerDown={startGitPanelResize}
              />
              <aside className="workspace-side-panel">
                {fileExplorerVisible ? (
                  <FileExplorerPanel
                    workspace={activeWorkspace.path}
                    workspaceName={activeFolderTitle}
                    gitStatus={gitStatus}
                    onOpenFile={(entry) => void openCodeFile(entry)}
                  />
                ) : (
                  <GitPanel workspace={activeWorkspace.path} status={gitStatus} onStatus={setGitStatus} />
                )}
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
          platform={pui.platform}
          layoutPresets={activeWorkspace?.kind !== "quick" ? (activeWorkspace?.layoutPresets ?? []) : []}
          quickCommands={activeWorkspace?.kind !== "quick" ? (activeWorkspace?.quickCommands ?? []) : []}
          onSaveLayoutPreset={() => void saveCurrentLayoutPreset()}
          onApplyLayoutPreset={(preset) => void applyLayoutPreset(preset)}
          onRunQuickCommand={runQuickCommand}
          showGit={Boolean(activeWorkspace && gitStatus?.isRepo)}
          onShowGit={() => setActiveSidePanel("git")}
        />
      ) : null}

      {settingsOpen && activeWorkspace ? (
        <SettingsModal
          settings={settings}
          activeWorkspace={activeWorkspace}
          onSettingsChange={updateSettings}
          onWorkspaceChange={updateActiveWorkspace}
          onReplayOnboarding={openReplayOnboarding}
          platform={pui.platform}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {devSettingsOpen && devToolsEnabled ? (
        <DevSettingsModal
          flagState={devToolsFlagState}
          platform={pui.platform}
          onOpenOnboarding={openDevOnboarding}
          onClose={() => setDevSettingsOpen(false)}
        />
      ) : null}

      {contextMenu ? (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={closeContextMenu} />
      ) : null}
    </div>
  );
}

async function persistWorkspaceLayout(
  settings: AppSettings,
  workspaceId: string,
  root: WorkbenchNode,
  activePaneId: string,
  terminalSnapshots: Record<string, Record<string, TerminalPaneSnapshot>>
): Promise<AppSettings> {
  return pui.settings.save({
    ...updateWorkspaceLayoutInSettings(settings, workspaceId, root, activePaneId),
    terminalSnapshots
  });
}

function scheduleTerminalSnapshotSave(
  snapshotsRef: { current: Record<string, Record<string, TerminalPaneSnapshot>> },
  timeoutRef: { current: number | undefined }
): void {
  if (timeoutRef.current !== undefined) {
    window.clearTimeout(timeoutRef.current);
  }

  timeoutRef.current = window.setTimeout(() => {
    timeoutRef.current = undefined;
    void pui.settings.saveTerminalSnapshots(cloneTerminalSnapshots(snapshotsRef.current));
  }, 2_000);
}

function cloneTerminalSnapshots(
  snapshots: Record<string, Record<string, TerminalPaneSnapshot>>
): Record<string, Record<string, TerminalPaneSnapshot>> {
  return Object.fromEntries(
    Object.entries(snapshots).map(([workspaceId, workspaceSnapshots]) => [workspaceId, { ...workspaceSnapshots }])
  );
}

function startPanelResize(
  event: ReactPointerEvent<HTMLElement>,
  options: {
    initialValue: number;
    min: number;
    max: number;
    calculate: (initialValue: number, deltaX: number, deltaY: number) => number;
    onChange: (value: number) => void;
    onCommit?: (value: number) => void;
  }
) {
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startY = event.clientY;
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  document.body.style.cursor =
    event.currentTarget.getAttribute("aria-orientation") === "horizontal" ? "row-resize" : "col-resize";
  document.body.style.userSelect = "none";
  let latestValue = options.initialValue;
  let resizeFrame: number | undefined;

  const onMove = (moveEvent: PointerEvent) => {
    latestValue = clamp(
      options.calculate(options.initialValue, moveEvent.clientX - startX, moveEvent.clientY - startY),
      options.min,
      options.max
    );
    if (resizeFrame !== undefined) {
      return;
    }
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = undefined;
      options.onChange(latestValue);
    });
  };

  const onUp = () => {
    if (resizeFrame !== undefined) {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = undefined;
    }
    options.onChange(latestValue);
    options.onCommit?.(latestValue);
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

function PaneTree({
  node,
  profilesById,
  fallbackProfile,
  workspaceName,
  terminalFontSize,
  terminalTheme,
  terminalThemeKey,
  workspaceId,
  activePaneId,
  showHeaders,
  canClosePanes,
  sessionsByPane,
  snapshotsByPane,
  onFocus,
  onClosePane,
  onPaneContextMenu,
  onSplitPane,
  onResizeSplit,
  onSession,
  onSnapshot
}: {
  node: WorkbenchNode;
  profilesById: Map<string, ConsoleProfile>;
  fallbackProfile?: ConsoleProfile;
  workspaceName: string;
  terminalFontSize?: number;
  terminalTheme: ITheme;
  terminalThemeKey: string;
  workspaceId: string;
  activePaneId: string;
  showHeaders: boolean;
  canClosePanes: boolean;
  sessionsByPane: Record<string, string>;
  snapshotsByPane: Record<string, TerminalPaneSnapshot>;
  onFocus: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onPaneContextMenu: (event: MouseEvent, paneId: string) => void;
  onSplitPane: (paneId: string, direction: "right" | "down") => void;
  onResizeSplit: (splitId: string, sizes: number[], commit?: boolean) => void;
  onSession: (paneId: string, sessionId: string) => void;
  onSnapshot: (paneId: string, snapshot: TerminalPaneSnapshot) => void;
}) {
  const splitRef = useRef<HTMLDivElement | null>(null);

  if (node.type === "split") {
    const sizes = normalizeSplitSizes(node.sizes, node.children.length);
    const tracks = buildSplitTracks(sizes, RESIZER_SIZE);
    const gridStyle = node.direction === "right" ? { gridTemplateColumns: tracks } : { gridTemplateRows: tracks };

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
        },
        onCommit: (delta) => {
          onResizeSplit(node.id, resizeAdjacentSplitSizes(startSizes, boundaryIndex, delta, dimension), true);
        }
      });
    };

    return (
      <div
        ref={splitRef}
        className={`pane-split ${node.direction === "right" ? "horizontal" : "vertical"}`}
        style={gridStyle}
      >
        {node.children.map((child, index) => (
          <Fragment key={child.id}>
            <PaneTree
              node={child}
              profilesById={profilesById}
              fallbackProfile={fallbackProfile}
              workspaceName={workspaceName}
              terminalFontSize={terminalFontSize}
              terminalTheme={terminalTheme}
              terminalThemeKey={terminalThemeKey}
              workspaceId={workspaceId}
              activePaneId={activePaneId}
              showHeaders={showHeaders}
              canClosePanes={canClosePanes}
              sessionsByPane={sessionsByPane}
              snapshotsByPane={snapshotsByPane}
              onFocus={onFocus}
              onClosePane={onClosePane}
              onPaneContextMenu={onPaneContextMenu}
              onSplitPane={onSplitPane}
              onResizeSplit={onResizeSplit}
              onSession={onSession}
              onSnapshot={onSnapshot}
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
      terminalTheme={terminalTheme}
      terminalThemeKey={terminalThemeKey}
      active={node.id === activePaneId}
      showHeader={showHeaders}
      canClose={canClosePanes}
      onFocus={() => onFocus(node.id)}
      onClose={() => onClosePane(node.id)}
      onSplitRight={() => onSplitPane(node.id, "right")}
      onSplitDown={() => onSplitPane(node.id, "down")}
      onContextMenu={(event) => onPaneContextMenu(event, node.id)}
      onSession={(sessionId) => onSession(node.id, sessionId)}
      initialSnapshot={snapshotsByPane[node.id]}
      onSnapshot={(snapshot) => onSnapshot(node.id, snapshot)}
    />
  );
}

function areGitStatusesEqual(left: GitStatus | null, right: GitStatus | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (
    left.workspace !== right.workspace ||
    left.isRepo !== right.isRepo ||
    left.branch !== right.branch ||
    left.error !== right.error ||
    left.files.length !== right.files.length
  ) {
    return false;
  }

  return left.files.every((file, index) => {
    const other = right.files[index];
    return (
      other &&
      file.path === other.path &&
      file.indexStatus === other.indexStatus &&
      file.workingTreeStatus === other.workingTreeStatus
    );
  });
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
