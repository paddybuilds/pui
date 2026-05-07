import {
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { PanelRight, PanelTop, Save, X } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import { useContextMenu } from "./useContextMenu";
import {
  type CodeEditorGroup,
  type CodeEditorNode,
  type CodeFileTab,
  collectCodeEditorGroups,
  createCodeEditorGroup,
  normalizeCodeSplitSizes,
  removeCodeEditorGroup,
  resizeAdjacentCodeSplitSizes,
  setCodeEditorGroupPath,
  splitCodeEditorGroup,
  updateCodeSplitSizes
} from "../lib/codeWorkspace";
import { codeAutocompleteExtension } from "../lib/editorAutocomplete";
import { shortcutLabel } from "../lib/shortcuts";

type CodeWorkspaceProps = {
  platform: string;
  autocompleteEnabled: boolean;
  workspaceFilePaths: string[];
  tabs: CodeFileTab[];
  activePath?: string;
  onActivate: (path: string) => void;
  onChange: (path: string, contents: string) => void;
  onSave: (path: string) => Promise<void>;
  onClose: (path: string) => void;
};

export function CodeWorkspace({
  platform,
  autocompleteEnabled,
  workspaceFilePaths,
  tabs,
  activePath,
  onActivate,
  onChange,
  onSave,
  onClose
}: CodeWorkspaceProps) {
  const [closeRequest, setCloseRequest] = useState<CodeFileTab | null>(null);
  const [layoutRoot, setLayoutRoot] = useState<CodeEditorNode>(() => createCodeEditorGroup(crypto.randomUUID()));
  const [activeGroupId, setActiveGroupId] = useState(() => collectCodeEditorGroups(layoutRoot)[0]?.id ?? "");
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
  const groups = useMemo(() => collectCodeEditorGroups(layoutRoot), [layoutRoot]);
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const activeGroupPath = activeGroup?.activePath ?? activePath;
  const activeTab =
    tabs.find((tab) => tab.path === activeGroupPath) ?? tabs.find((tab) => tab.path === activePath) ?? tabs[0];
  const tabByPath = useMemo(() => new Map(tabs.map((tab) => [tab.path, tab])), [tabs]);

  useEffect(() => {
    if (!activeGroup) {
      const nextRoot = createCodeEditorGroup(crypto.randomUUID(), activePath);
      setLayoutRoot(nextRoot);
      setActiveGroupId(nextRoot.id);
      return;
    }
    if (activePath && activePath !== activeGroup.activePath) {
      setLayoutRoot((current) => setCodeEditorGroupPath(current, activeGroup.id, activePath));
    }
  }, [activeGroup, activePath]);

  useEffect(() => {
    setLayoutRoot((current) => {
      let next = current;
      collectCodeEditorGroups(current).forEach((group) => {
        if (group.activePath && !tabByPath.has(group.activePath)) {
          next = setCodeEditorGroupPath(next, group.id, tabs[0]?.path);
        }
      });
      return next;
    });
  }, [tabByPath, tabs]);

  const requestClose = (tab: CodeFileTab) => {
    if (tab.dirty) {
      setCloseRequest(tab);
      return;
    }
    onClose(tab.path);
  };

  const saveActive = async () => {
    if (activeTab && !activeTab.loading) {
      await onSave(activeTab.path);
    }
  };

  const activateGroupPath = (groupId: string, path: string) => {
    setActiveGroupId(groupId);
    setLayoutRoot((current) => setCodeEditorGroupPath(current, groupId, path));
    onActivate(path);
  };

  const splitGroup = (groupId: string, direction: "right" | "down") => {
    const group = groups.find((item) => item.id === groupId);
    const nextGroupId = crypto.randomUUID();
    setLayoutRoot((current) =>
      splitCodeEditorGroup(
        current,
        groupId,
        direction,
        { splitId: crypto.randomUUID(), groupId: nextGroupId },
        group?.activePath ?? activeTab?.path
      )
    );
    setActiveGroupId(nextGroupId);
  };

  const closeGroup = (groupId: string) => {
    if (groups.length <= 1) {
      return;
    }
    const nextRoot = removeCodeEditorGroup(layoutRoot, groupId);
    if (!nextRoot) {
      return;
    }
    const nextGroups = collectCodeEditorGroups(nextRoot);
    setLayoutRoot(nextRoot);
    setActiveGroupId((current) => (current === groupId ? (nextGroups[0]?.id ?? "") : current));
  };

  const openEditorContextMenu = (event: MouseEvent, group: CodeEditorGroup, tab: CodeFileTab) => {
    setActiveGroupId(group.id);
    openContextMenu(event, [
      {
        id: "save-file",
        label: tab.dirty ? "Save file" : "File saved",
        shortcut: shortcutLabel("CmdOrCtrl+S", platform),
        icon: <Save size={14} />,
        disabled: tab.loading || !tab.dirty,
        onSelect: () => void onSave(tab.path)
      },
      {
        id: "split-right",
        label: "Split right",
        shortcut: shortcutLabel("CmdOrCtrl+D", platform),
        icon: <PanelRight size={14} />,
        onSelect: () => splitGroup(group.id, "right")
      },
      {
        id: "split-down",
        label: "Split down",
        shortcut: shortcutLabel("CmdOrCtrl+Shift+D", platform),
        icon: <PanelTop size={14} />,
        onSelect: () => splitGroup(group.id, "down")
      },
      {
        id: "close-split",
        label: groups.length <= 1 ? "Cannot close last split" : "Close split",
        shortcut: shortcutLabel("CmdOrCtrl+W", platform),
        icon: <X size={14} />,
        destructive: true,
        disabled: groups.length <= 1,
        onSelect: () => closeGroup(group.id)
      }
    ]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveActive();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      if (activeGroup) {
        splitGroup(activeGroup.id, "down");
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      if (activeGroup) {
        splitGroup(activeGroup.id, "right");
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w" && groups.length > 1) {
      event.preventDefault();
      if (activeGroup) {
        closeGroup(activeGroup.id);
      }
    }
  };

  return (
    <section className="code-workspace" aria-label="Code workspace" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="code-tabs" role="tablist" aria-label="Open files">
        {tabs.map((tab) => (
          <button
            key={tab.path}
            type="button"
            role="tab"
            aria-selected={tab.path === activeTab?.path}
            className={tab.path === activeTab?.path ? "code-tab active" : "code-tab"}
            title={tab.relativePath}
            onClick={() => {
              const groupId = activeGroup?.id ?? groups[0]?.id;
              if (groupId) {
                activateGroupPath(groupId, tab.path);
              }
            }}
          >
            <span>{tab.name}</span>
            {tab.dirty ? <small aria-label="Unsaved changes" /> : null}
            <span
              role="button"
              tabIndex={0}
              className="code-tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={(event) => {
                event.stopPropagation();
                requestClose(tab);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  requestClose(tab);
                }
              }}
            >
              <X size={13} />
            </span>
          </button>
        ))}
      </div>

      {tabs.length ? (
        <div className="code-editor-layout">
          <CodeEditorTree
            node={layoutRoot}
            tabs={tabs}
            activeGroupId={activeGroup?.id}
            tabByPath={tabByPath}
            autocompleteEnabled={autocompleteEnabled}
            workspaceFilePaths={workspaceFilePaths}
            onFocusGroup={setActiveGroupId}
            onActivatePath={activateGroupPath}
            onChange={onChange}
            onSave={onSave}
            onSplit={splitGroup}
            onCloseGroup={closeGroup}
            onOpenContextMenu={openEditorContextMenu}
            onResizeSplit={(splitId, sizes) =>
              setLayoutRoot((current) => updateCodeSplitSizes(current, splitId, sizes))
            }
            canCloseGroups={groups.length > 1}
          />
        </div>
      ) : (
        <div className="code-empty">
          <strong>No file open</strong>
          <span>Select a file in Explorer to open it here.</span>
        </div>
      )}

      {closeRequest ? (
        <div className="code-close-backdrop" onMouseDown={() => setCloseRequest(null)}>
          <section
            className="code-close-dialog"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <strong>Save changes to {closeRequest.name}?</strong>
            <span>Your unsaved edits will be lost if you discard them.</span>
            <div>
              <button
                type="button"
                onClick={async () => {
                  await onSave(closeRequest.path);
                  onClose(closeRequest.path);
                  setCloseRequest(null);
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose(closeRequest.path);
                  setCloseRequest(null);
                }}
              >
                Discard
              </button>
              <button type="button" onClick={() => setCloseRequest(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
          ariaLabel="Code editor context menu"
        />
      ) : null}
    </section>
  );
}

function CodeEditorTree({
  node,
  tabs,
  activeGroupId,
  tabByPath,
  autocompleteEnabled,
  workspaceFilePaths,
  onFocusGroup,
  onActivatePath,
  onChange,
  onSave,
  onSplit,
  onCloseGroup,
  onOpenContextMenu,
  onResizeSplit,
  canCloseGroups
}: {
  node: CodeEditorNode;
  tabs: CodeFileTab[];
  activeGroupId?: string;
  tabByPath: Map<string, CodeFileTab>;
  autocompleteEnabled: boolean;
  workspaceFilePaths: string[];
  onFocusGroup: (groupId: string) => void;
  onActivatePath: (groupId: string, path: string) => void;
  onChange: (path: string, contents: string) => void;
  onSave: (path: string) => Promise<void>;
  onSplit: (groupId: string, direction: "right" | "down") => void;
  onCloseGroup: (groupId: string) => void;
  onOpenContextMenu: (event: MouseEvent, group: CodeEditorGroup, tab: CodeFileTab) => void;
  onResizeSplit: (splitId: string, sizes: number[]) => void;
  canCloseGroups: boolean;
}) {
  const splitRef = useRef<HTMLDivElement | null>(null);

  if (node.type === "split") {
    const sizes = normalizeCodeSplitSizes(node.sizes, node.children.length);
    const tracks = buildCodeSplitTracks(sizes);
    const gridStyle = node.direction === "right" ? { gridTemplateColumns: tracks } : { gridTemplateRows: tracks };

    const startResize = (event: ReactPointerEvent<HTMLElement>, boundaryIndex: number) => {
      const container = splitRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const dimension = node.direction === "right" ? rect.width : rect.height;
      const startSizes = normalizeCodeSplitSizes(node.sizes, node.children.length);
      const startX = event.clientX;
      const startY = event.clientY;
      event.preventDefault();

      const onPointerMove = (moveEvent: PointerEvent) => {
        const delta = node.direction === "right" ? moveEvent.clientX - startX : moveEvent.clientY - startY;
        onResizeSplit(node.id, resizeAdjacentCodeSplitSizes(startSizes, boundaryIndex, delta, dimension));
      };
      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    };

    return (
      <div
        ref={splitRef}
        className={`code-editor-split ${node.direction === "right" ? "horizontal" : "vertical"}`}
        style={gridStyle}
      >
        {node.children.map((child, index) => (
          <Fragment key={child.id}>
            <CodeEditorTree
              node={child}
              tabs={tabs}
              activeGroupId={activeGroupId}
              tabByPath={tabByPath}
              autocompleteEnabled={autocompleteEnabled}
              workspaceFilePaths={workspaceFilePaths}
              onFocusGroup={onFocusGroup}
              onActivatePath={onActivatePath}
              onChange={onChange}
              onSave={onSave}
              onSplit={onSplit}
              onCloseGroup={onCloseGroup}
              onOpenContextMenu={onOpenContextMenu}
              onResizeSplit={onResizeSplit}
              canCloseGroups={canCloseGroups}
            />
            {index < node.children.length - 1 ? (
              <div
                className={`code-editor-resizer ${node.direction === "right" ? "vertical" : "horizontal"}`}
                role="separator"
                aria-orientation={node.direction === "right" ? "vertical" : "horizontal"}
                title="Resize code split"
                onPointerDown={(event) => startResize(event, index)}
              />
            ) : null}
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <CodeEditorGroupView
      group={node}
      active={node.id === activeGroupId}
      tab={node.activePath ? tabByPath.get(node.activePath) : undefined}
      fallbackTab={tabs[0]}
      allTabs={tabs}
      autocompleteEnabled={autocompleteEnabled}
      workspaceFilePaths={workspaceFilePaths}
      onFocus={() => onFocusGroup(node.id)}
      onActivatePath={(path) => onActivatePath(node.id, path)}
      onChange={onChange}
      onOpenContextMenu={(event, tab) => onOpenContextMenu(event, node, tab)}
      onCloseGroup={() => onCloseGroup(node.id)}
      canCloseGroup={canCloseGroups}
    />
  );
}

function CodeEditorGroupView({
  group,
  active,
  tab,
  fallbackTab,
  allTabs,
  autocompleteEnabled,
  workspaceFilePaths,
  onFocus,
  onActivatePath,
  onChange,
  onOpenContextMenu,
  onCloseGroup,
  canCloseGroup
}: {
  group: CodeEditorGroup;
  active: boolean;
  tab?: CodeFileTab;
  fallbackTab?: CodeFileTab;
  allTabs: CodeFileTab[];
  autocompleteEnabled: boolean;
  workspaceFilePaths: string[];
  onFocus: () => void;
  onActivatePath: (path: string) => void;
  onChange: (path: string, contents: string) => void;
  onOpenContextMenu: (event: MouseEvent, tab: CodeFileTab) => void;
  onCloseGroup: () => void;
  canCloseGroup: boolean;
}) {
  const activeTab = tab ?? fallbackTab;
  const extensions = useMemo(() => {
    if (!activeTab) {
      return [];
    }
    const baseExtensions = editorExtensionsForPath(activeTab.path);
    return autocompleteEnabled
      ? [...baseExtensions, codeAutocompleteExtension(allTabs, workspaceFilePaths)]
      : baseExtensions;
  }, [activeTab, allTabs, autocompleteEnabled, workspaceFilePaths]);

  useEffect(() => {
    if (activeTab && activeTab.path !== group.activePath) {
      onActivatePath(activeTab.path);
    }
  }, [activeTab, group.activePath, onActivatePath]);

  if (!activeTab) {
    return null;
  }

  return (
    <div
      className={active ? "code-editor-shell active" : "code-editor-shell"}
      onMouseDown={onFocus}
      onContextMenu={(event) => onOpenContextMenu(event, activeTab)}
    >
      <header className="code-editor-header">
        <span
          className="profile-dot"
          style={{ background: activeTab.dirty ? "var(--warning)" : "var(--accent)" }}
          aria-hidden="true"
        />
        <div>
          <strong title={activeTab.path}>{activeTab.relativePath}</strong>
          <span>{activeTab.loading ? "Loading" : activeTab.dirty ? "Unsaved changes" : "Saved"}</span>
        </div>
        {canCloseGroup ? (
          <button
            className="pane-close"
            type="button"
            title="Close split"
            aria-label="Close split"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onCloseGroup();
            }}
          >
            <X size={12} />
          </button>
        ) : null}
      </header>
      {activeTab.error ? <div className="code-error">{activeTab.error}</div> : null}
      <div className="code-editor-host">
        <CodeMirror
          value={activeTab.contents}
          height="100%"
          theme={oneDark}
          extensions={extensions}
          editable={!activeTab.loading}
          basicSetup={{
            foldGutter: true,
            highlightActiveLine: true,
            lineNumbers: true,
            searchKeymap: true
          }}
          onFocus={onFocus}
          onChange={(value) => onChange(activeTab.path, value)}
        />
      </div>
    </div>
  );
}

function buildCodeSplitTracks(sizes: number[]): string {
  return sizes.map((size) => `${size}fr`).join(" 5px ");
}

function editorExtensionsForPath(filePath: string): Extension[] {
  const extension = filePath.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "ts":
    case "tsx":
      return [javascript({ jsx: extension === "tsx", typescript: true })];
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return [javascript({ jsx: extension === "jsx" })];
    case "css":
      return [css()];
    case "html":
    case "htm":
      return [html()];
    case "json":
      return [json()];
    case "md":
    case "mdx":
      return [markdown()];
    default:
      return [];
  }
}
