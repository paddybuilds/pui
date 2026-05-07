import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitCompare, PanelRight, PanelTop, Plus, Search, Settings, Sparkles, TerminalSquare, Trash2, X } from "lucide-react";
import type {
  AppSettings,
  CodexRun,
  ConsoleProfile,
  GitStatus,
  TerminalWorkspace,
  WorkbenchNode,
  WorkbenchPane
} from "../../shared/types";
import { CodexPanel } from "./components/CodexPanel";
import { CommandPalette } from "./components/CommandPalette";
import { ContextMenu } from "./components/ContextMenu";
import { DiffPanel } from "./components/DiffPanel";
import { SettingsModal } from "./components/SettingsModal";
import { disposeTerminalPane, disposeTerminalPanes, TerminalPane } from "./components/TerminalPane";
import { useContextMenu } from "./components/useContextMenu";
import { WorkspaceModal } from "./components/WorkspaceModal";
import { getPuiApi } from "./lib/browserApi";

type Pane = WorkbenchPane & {
  sessionId?: string;
};

const newId = () => crypto.randomUUID();
const pui = getPuiApi();

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [layoutRoot, setLayoutRoot] = useState<WorkbenchNode | null>(null);
  const [sessionsByWorkspace, setSessionsByWorkspace] = useState<Record<string, Record<string, string>>>({});
  const [activePaneId, setActivePaneId] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState<"codex" | "diff" | null>(null);
  const [rightPanel, setRightPanel] = useState<"codex" | "diff">("codex");
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [codexRuns, setCodexRuns] = useState<CodexRun[]>([]);
  const didHydrateRef = useRef(false);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  const workspaces = settings?.workspaces ?? [];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const activeFolderTitle = activeWorkspace ? basename(activeWorkspace.path) : "";
  const activeFolderSubtitle =
    activeWorkspace && activeWorkspace.name !== activeFolderTitle
      ? `${activeWorkspace.name} · ${activeWorkspace.path}`
      : activeWorkspace?.path ?? "";
  const profiles = activeWorkspace?.profiles ?? [];
  const panes = useMemo(() => (layoutRoot ? collectPanes(layoutRoot) : []), [layoutRoot]);
  const activePane = panes.find((pane) => pane.id === activePaneId);
  const activeWorkspaceSessions = activeWorkspace ? sessionsByWorkspace[activeWorkspace.id] ?? {} : {};
  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  useEffect(() => {
    void pui.settings.load().then(async (loaded) => {
      const normalized = normalizeSettings(loaded);
      const initialWorkspace =
        normalized.workspaces!.find((workspace) => workspace.id === normalized.activeWorkspaceId) ?? normalized.workspaces![0];
      setSettings(normalized);
      hydrateWorkspace(initialWorkspace);
      setActiveWorkspaceId(initialWorkspace.id);
      didHydrateRef.current = true;
      await refreshGit(initialWorkspace.path);
      await pui.git.watch(initialWorkspace.path);
      if (!loaded.workspaces) {
        await pui.settings.save(normalized);
      }
    });

    const offGit = pui.git.onChanged(({ workspace }) => {
      void refreshGit(workspace);
    });
    const offCodex = pui.codex.onUpdate((run) => {
      setCodexRuns((current) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 20));
      if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
        void refreshGit(run.workspace);
      }
    });
    return () => {
      offGit();
      offCodex();
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
    await refreshGit(workspace.path);
    await pui.git.watch(workspace.path);
    setPanelOpen(null);
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        openPanel("codex");
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [splitActivePane]);

  const openPanel = (panel: "codex" | "diff") => {
    setRightPanel(panel);
    setPanelOpen((current) => (current === panel ? null : panel));
  };

  const createWorkspace = async ({ name, path }: { name: string; path: string }) => {
    if (!settings) {
      return;
    }

    const defaultCwd = path.trim();
    const profile = createShellProfile(defaultCwd, "CmdOrCtrl+1");
    const paneId = newId();
    const workspace: TerminalWorkspace = {
      id: newId(),
      name: name.trim() || basename(defaultCwd),
      path: defaultCwd,
      defaultCwd,
      terminalFontSize: 13,
      profiles: [profile],
      layout: {
        activePaneId: paneId,
        root: { type: "pane", id: paneId, profileId: profile.id }
      }
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
    setWorkspaceModalOpen(false);
  };

  const deleteWorkspace = async (workspaceId: string) => {
    if (!settings || workspaces.length <= 1) {
      return;
    }
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace || !window.confirm(`Remove folder "${workspace.name}" from Pui? Terminal sessions for this folder will be closed.`)) {
      return;
    }

    disposeTerminalPanes(workspace.id, collectPanes(workspace.layout.root).map((pane) => pane.id));
    const remainingWorkspaces = workspaces.filter((item) => item.id !== workspace.id);
    const nextActiveWorkspace = workspace.id === activeWorkspace?.id ? remainingWorkspaces[0] : activeWorkspace;
    const nextSettings = {
      ...settings,
      activeWorkspaceId: nextActiveWorkspace?.id,
      workspace: nextActiveWorkspace?.path ?? remainingWorkspaces[0].path,
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
      await refreshGit(nextActiveWorkspace.path);
      await pui.git.watch(nextActiveWorkspace.path);
    }
    closeContextMenu();
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
    await refreshGit(workspace.path);
    await pui.git.watch(workspace.path);
  };

  const openWorkspaceContextMenu = (event: MouseEvent, workspace: TerminalWorkspace) => {
    openContextMenu(event, [
      {
        id: "open-workspace",
        label: "Open folder",
        onSelect: () => void switchWorkspace(workspace)
      },
      {
        id: "delete-workspace",
        label: workspaces.length <= 1 ? "Cannot remove last folder" : "Remove folder",
        icon: <Trash2 size={14} />,
        destructive: true,
        disabled: workspaces.length <= 1,
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

  if (!settings || !activeWorkspace || !layoutRoot) {
    return <div className="boot">loading shell</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <TerminalSquare size={18} />
          <span>Pui</span>
        </div>

        <div className="sidebar-actions">
          <button className="rail-button" type="button" title="Command palette" onClick={() => setPaletteOpen(true)}>
            <Search size={16} />
            <span>Search</span>
          </button>
          <button
            className={panelOpen === "codex" ? "rail-button active" : "rail-button"}
            type="button"
            title="Codex"
            onClick={() => openPanel("codex")}
          >
            <Sparkles size={16} />
            <span>Codex</span>
          </button>
          <button
            className={panelOpen === "diff" ? "rail-button active" : "rail-button"}
            type="button"
            title="Diffs"
            onClick={() => openPanel("diff")}
          >
            <GitCompare size={16} />
            <span>Diffs</span>
          </button>
          <button
            className={settingsOpen ? "rail-button active" : "rail-button"}
            type="button"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>

        <div className="sidebar-label">Folders</div>
        <section className="workspace-list">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              className={workspace.id === activeWorkspace.id ? "workspace-button active" : "workspace-button"}
              title={workspace.path}
              onClick={() => switchWorkspace(workspace)}
              onContextMenu={(event) => openWorkspaceContextMenu(event, workspace)}
            >
              <span>{workspace.name.slice(0, 2).toUpperCase()}</span>
              <strong>{workspace.name}</strong>
            </button>
          ))}
        </section>

        <div className="new-profile">
          <button type="button" onClick={() => setWorkspaceModalOpen(true)}>
            <Plus size={14} />
            <span>Open folder</span>
          </button>
        </div>
      </aside>

      <main className="workbench">
        <header className="workspace-topbar">
          <div className="workspace-topbar-title">
            <strong>{activeFolderTitle}</strong>
            <span>{activeFolderSubtitle}</span>
          </div>
          <div className="workspace-topbar-actions">
            <button type="button" title="Open folder" onClick={() => setWorkspaceModalOpen(true)}>
              <Plus size={14} />
              <span>Folder</span>
            </button>
            <button type="button" title="Split right" onClick={() => splitActivePane("right")}>
              <PanelRight size={14} />
              <span>Split</span>
            </button>
            <button
              type="button"
              className={panelOpen === "codex" ? "active" : ""}
              title="Codex"
              onClick={() => openPanel("codex")}
            >
              <Sparkles size={14} />
              <span>Codex</span>
            </button>
            <button
              type="button"
              className={panelOpen === "diff" ? "active" : ""}
              title="Diffs"
              onClick={() => openPanel("diff")}
            >
              <GitCompare size={14} />
              <span>Diffs</span>
              {gitStatus?.files.length ? <small>{gitStatus.files.length}</small> : null}
            </button>
            <button type="button" className={settingsOpen ? "active" : ""} title="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings size={14} />
            </button>
          </div>
        </header>
        <div className="content-row">
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

          {panelOpen ? (
            <>
              <div className="panel-scrim" onClick={() => setPanelOpen(null)} />
              <aside className="right-panel open">
                <div className="panel-tabs">
                  <button
                    type="button"
                    className={rightPanel === "codex" ? "active" : ""}
                    onClick={() => setRightPanel("codex")}
                  >
                    <Sparkles size={15} />
                    Codex
                  </button>
                  <button
                    type="button"
                    className={rightPanel === "diff" ? "active" : ""}
                    onClick={() => setRightPanel("diff")}
                  >
                    <GitCompare size={15} />
                    Diffs
                  </button>
                </div>
                {rightPanel === "codex" ? (
                  <CodexPanel workspace={activeWorkspace.path} runs={codexRuns} onRefreshGit={() => refreshGit(activeWorkspace.path)} />
                ) : (
                  <DiffPanel workspace={activeWorkspace.path} status={gitStatus} onStatus={setGitStatus} />
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
          onShowCodex={() => openPanel("codex")}
          onShowDiff={() => openPanel("diff")}
        />
      ) : null}

      {workspaceModalOpen ? (
        <WorkspaceModal
          defaultPath={activeWorkspace.defaultCwd || activeWorkspace.path}
          onClose={() => setWorkspaceModalOpen(false)}
          onCreate={createWorkspace}
        />
      ) : null}

      {settingsOpen ? (
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

function normalizeSettings(settings: AppSettings): AppSettings {
  if (settings.workspaces && settings.workspaces.length > 0) {
    const workspaces = settings.workspaces.map((workspace) => ({
      ...workspace,
      defaultCwd: workspace.defaultCwd || workspace.path,
      terminalFontSize: workspace.terminalFontSize || 13,
      profiles: workspace.profiles.map((profile) => ({
        ...profile,
        cwd: profile.cwd || workspace.defaultCwd || workspace.path
      }))
    }));
    const activeWorkspaceId = settings.activeWorkspaceId ?? workspaces[0].id;
    return { ...settings, activeWorkspaceId, workspaces };
  }

  const path = settings.workspace;
  const profiles = settings.profiles.length > 0 ? settings.profiles : [createShellProfile(path, "CmdOrCtrl+1")];
  const paneId = newId();
  const workspace: TerminalWorkspace = {
    id: "main-workspace",
    name: basename(path) || "workspace",
    path,
    defaultCwd: path,
    terminalFontSize: 13,
    profiles: profiles.map((profile, index) => ({ ...profile, cwd: path, shortcut: `CmdOrCtrl+${index + 1}` })),
    layout: {
      activePaneId: paneId,
      root: { type: "pane", id: paneId, profileId: profiles[0]?.id }
    }
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
  onSession: (paneId: string, sessionId: string) => void;
}) {
  if (node.type === "split") {
    return (
      <div className={`pane-split ${node.direction === "right" ? "horizontal" : "vertical"}`}>
        {node.children.map((child) => (
          <PaneTree
            key={child.id}
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
            onSession={onSession}
          />
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
    children: normalizedPanes
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
  return { ...node, id: node.id || newId(), children };
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
      children: [root, { type: "pane", id: newPane.id, profileId: newPane.profileId }]
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

  const children = root.children.map((child) => removePane(child, targetPaneId)).filter((child): child is WorkbenchNode => Boolean(child));
  if (children.length === 0) {
    return null;
  }
  if (children.length === 1) {
    return children[0];
  }
  return { ...root, children };
}

function createShellProfile(path: string, shortcut: string): ConsoleProfile {
  return {
    id: newId(),
    name: "shell",
    cwd: path,
    command: "/bin/zsh",
    args: [],
    env: {},
    shortcut,
    appearance: {
      color: "#9ca3af",
      icon: "terminal"
    }
  };
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
