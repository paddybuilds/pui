import { type CSSProperties, type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2
} from "lucide-react";
import type { FileSystemEntry, GitFileStatus, GitStatus } from "../../../shared/types";
import { ContextMenu } from "./ContextMenu";
import { useContextMenu } from "./useContextMenu";
import { getPuiApi } from "../lib/browserApi";

type FileExplorerPanelProps = {
  workspace: string;
  workspaceName: string;
  gitStatus: GitStatus | null;
  onOpenFile: (entry: FileSystemEntry) => void;
};

type DirectoryState = {
  entries: FileSystemEntry[];
  loading: boolean;
  error?: string;
};

const pui = getPuiApi();

export function FileExplorerPanel({ workspace, workspaceName, gitStatus, onOpenFile }: FileExplorerPanelProps) {
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set([workspace]));
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({});
  const [operationError, setOperationError] = useState<string>();
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  const loadDirectory = useCallback(
    async (directory: string) => {
      setDirectories((current) => ({
        ...current,
        [directory]: {
          entries: current[directory]?.entries ?? [],
          loading: true
        }
      }));
      try {
        const entries = await pui.fileSystem.readDirectory(workspace, directory);
        setDirectories((current) => ({
          ...current,
          [directory]: {
            entries,
            loading: false
          }
        }));
      } catch (error) {
        setDirectories((current) => ({
          ...current,
          [directory]: {
            entries: current[directory]?.entries ?? [],
            loading: false,
            error: error instanceof Error ? error.message : String(error)
          }
        }));
      }
    },
    [workspace]
  );

  useEffect(() => {
    setExpandedDirectories(new Set([workspace]));
    setDirectories({});
    void loadDirectory(workspace);
  }, [loadDirectory, workspace]);

  const rootState = directories[workspace];
  const rootEntries = useMemo(() => rootState?.entries ?? [], [rootState?.entries]);
  const gitFileStatusByPath = useMemo(() => createGitFileStatusMap(gitStatus), [gitStatus]);
  const changedDirectoryPaths = useMemo(() => createChangedDirectorySet(gitFileStatusByPath), [gitFileStatusByPath]);

  const toggleDirectory = (entry: FileSystemEntry) => {
    setExpandedDirectories((current) => {
      const next = new Set(current);
      if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.add(entry.path);
        void loadDirectory(entry.path);
      }
      return next;
    });
  };

  const refresh = () => {
    const openDirectories = Array.from(expandedDirectories);
    openDirectories.forEach((directory) => void loadDirectory(directory));
  };

  const refreshDirectory = (directory: string) => {
    void loadDirectory(directory);
  };

  const createFile = async (directory: string) => {
    const name = window.prompt("New file name")?.trim();
    if (!name) {
      return;
    }
    await runFileOperation(async () => {
      const result = await pui.fileSystem.createFile(workspace, directory, name);
      refreshDirectory(directory);
      if (result.entry?.kind === "file") {
        onOpenFile(result.entry);
      }
    });
  };

  const createDirectory = async (directory: string) => {
    const name = window.prompt("New folder name")?.trim();
    if (!name) {
      return;
    }
    await runFileOperation(async () => {
      await pui.fileSystem.createDirectory(workspace, directory, name);
      setExpandedDirectories((current) => new Set(current).add(directory));
      refreshDirectory(directory);
    });
  };

  const renameEntry = async (entry: FileSystemEntry) => {
    const name = window.prompt("Rename", entry.name)?.trim();
    if (!name || name === entry.name) {
      return;
    }
    const parent = parentDirectory(entry.path, workspace);
    await runFileOperation(async () => {
      const wasExpanded = expandedDirectories.has(entry.path);
      const result = await pui.fileSystem.rename(workspace, entry.path, name);
      setExpandedDirectories((current) => {
        const next = new Set(current);
        next.delete(entry.path);
        if (wasExpanded && result.entry?.kind === "directory") {
          next.add(result.entry.path);
        }
        return next;
      });
      refreshDirectory(parent);
      if (wasExpanded && result.entry?.kind === "directory") {
        refreshDirectory(result.entry.path);
      }
    });
  };

  const deleteEntry = async (entry: FileSystemEntry) => {
    const confirmed = window.confirm(`Delete ${entry.name}?`);
    if (!confirmed) {
      return;
    }
    const parent = parentDirectory(entry.path, workspace);
    await runFileOperation(async () => {
      await pui.fileSystem.delete(workspace, entry.path);
      setExpandedDirectories((current) => {
        const next = new Set(
          Array.from(current).filter((directory) => directory !== entry.path && !isChildPath(directory, entry.path))
        );
        return next;
      });
      refreshDirectory(parent);
    });
  };

  const copyPath = async (path: string) => {
    await runFileOperation(async () => {
      await navigator.clipboard.writeText(path);
    });
  };

  const runFileOperation = async (operation: () => Promise<void>) => {
    try {
      setOperationError(undefined);
      await operation();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    }
  };

  const openExplorerContextMenu = (event: MouseEvent, directory = workspace) => {
    openContextMenu(event, [
      {
        id: "new-file",
        label: "New file",
        icon: <FilePlus size={14} />,
        onSelect: () => void createFile(directory)
      },
      {
        id: "new-folder",
        label: "New folder",
        icon: <FolderPlus size={14} />,
        onSelect: () => void createDirectory(directory)
      },
      {
        id: "refresh",
        label: "Refresh",
        icon: <RefreshCw size={14} />,
        onSelect: () => refreshDirectory(directory)
      },
      {
        id: "copy-path",
        label: "Copy path",
        icon: <Copy size={14} />,
        onSelect: () => void copyPath(directory)
      }
    ]);
  };

  const openEntryContextMenu = (event: MouseEvent, entry: FileSystemEntry) => {
    const isDirectory = entry.kind === "directory";
    openContextMenu(event, [
      ...(isDirectory
        ? [
            {
              id: "new-file",
              label: "New file",
              icon: <FilePlus size={14} />,
              onSelect: () => void createFile(entry.path)
            },
            {
              id: "new-folder",
              label: "New folder",
              icon: <FolderPlus size={14} />,
              onSelect: () => void createDirectory(entry.path)
            },
            {
              id: "refresh",
              label: "Refresh folder",
              icon: <RefreshCw size={14} />,
              onSelect: () => refreshDirectory(entry.path)
            }
          ]
        : [
            {
              id: "open-file",
              label: "Open file",
              icon: <File size={14} />,
              onSelect: () => onOpenFile(entry)
            }
          ]),
      {
        id: "rename",
        label: "Rename",
        icon: <Pencil size={14} />,
        onSelect: () => void renameEntry(entry)
      },
      {
        id: "copy-path",
        label: "Copy path",
        icon: <Copy size={14} />,
        onSelect: () => void copyPath(entry.path)
      },
      {
        id: "delete",
        label: "Delete",
        icon: <Trash2 size={14} />,
        destructive: true,
        onSelect: () => void deleteEntry(entry)
      }
    ]);
  };

  return (
    <div className="file-explorer-panel">
      <div className="file-explorer-header" onContextMenu={(event) => openExplorerContextMenu(event)}>
        <div>
          <strong>Explorer</strong>
          <span title={workspace}>{workspaceName}</span>
        </div>
        <button type="button" title="Refresh explorer" aria-label="Refresh explorer" onClick={refresh}>
          <RefreshCw size={14} />
        </button>
      </div>
      {operationError ? <div className="file-tree-note error">{operationError}</div> : null}
      <div
        className="file-tree"
        role="tree"
        aria-label={`${workspaceName} files`}
        onContextMenu={(event) => {
          if (event.target === event.currentTarget) {
            openExplorerContextMenu(event);
          }
        }}
      >
        {rootState?.loading && rootEntries.length === 0 ? <div className="empty-state">Loading files.</div> : null}
        {rootState?.error ? <div className="empty-state">{rootState.error}</div> : null}
        {rootEntries.map((entry) => (
          <FileTreeEntry
            key={entry.path}
            entry={entry}
            depth={0}
            expandedDirectories={expandedDirectories}
            directories={directories}
            gitFileStatusByPath={gitFileStatusByPath}
            changedDirectoryPaths={changedDirectoryPaths}
            onOpenFile={onOpenFile}
            onToggleDirectory={toggleDirectory}
            onOpenContextMenu={openEntryContextMenu}
          />
        ))}
        {!rootState?.loading && !rootState?.error && rootEntries.length === 0 ? (
          <div className="empty-state">No files found.</div>
        ) : null}
      </div>
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
          ariaLabel="File explorer context menu"
        />
      ) : null}
    </div>
  );
}

function FileTreeEntry({
  entry,
  depth,
  expandedDirectories,
  directories,
  gitFileStatusByPath,
  changedDirectoryPaths,
  onOpenFile,
  onToggleDirectory,
  onOpenContextMenu
}: {
  entry: FileSystemEntry;
  depth: number;
  expandedDirectories: Set<string>;
  directories: Record<string, DirectoryState>;
  gitFileStatusByPath: Map<string, GitFileStatus>;
  changedDirectoryPaths: Set<string>;
  onOpenFile: (entry: FileSystemEntry) => void;
  onToggleDirectory: (entry: FileSystemEntry) => void;
  onOpenContextMenu: (event: MouseEvent, entry: FileSystemEntry) => void;
}) {
  const isDirectory = entry.kind === "directory";
  const expanded = isDirectory && expandedDirectories.has(entry.path);
  const directoryState = directories[entry.path];
  const normalizedRelativePath = normalizeGitPath(entry.relativePath);
  const gitFileStatus = isDirectory ? undefined : gitFileStatusByPath.get(normalizedRelativePath);
  const directoryHasChanges = isDirectory && changedDirectoryPaths.has(normalizedRelativePath);
  const changed = Boolean(gitFileStatus || directoryHasChanges);
  const changeKind = gitFileStatus ? describeGitFileStatus(gitFileStatus) : directoryHasChanges ? "Changed files" : "";

  return (
    <>
      <button
        type="button"
        className={changed ? "file-tree-row changed" : "file-tree-row"}
        style={{ "--file-tree-depth": depth } as CSSProperties}
        title={changeKind ? `${entry.path} · ${changeKind}` : entry.path}
        role="treeitem"
        aria-expanded={isDirectory ? expanded : undefined}
        onClick={() => {
          if (isDirectory) {
            onToggleDirectory(entry);
          } else {
            onOpenFile(entry);
          }
        }}
        onContextMenu={(event) => onOpenContextMenu(event, entry)}
      >
        <span className="file-tree-chevron" aria-hidden="true">
          {isDirectory ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
        </span>
        {isDirectory ? <Folder size={14} /> : <File size={14} />}
        <span>{entry.name}</span>
        {changed ? <small className={gitFileStatus ? "file-tree-change-badge" : "file-tree-change-dot"} /> : null}
      </button>
      {expanded ? (
        <div role="group">
          {directoryState?.loading && !directoryState.entries.length ? (
            <div className="file-tree-note" style={{ "--file-tree-depth": depth + 1 } as CSSProperties}>
              Loading
            </div>
          ) : null}
          {directoryState?.error ? (
            <div className="file-tree-note error" style={{ "--file-tree-depth": depth + 1 } as CSSProperties}>
              {directoryState.error}
            </div>
          ) : null}
          {directoryState?.entries.map((child) => (
            <FileTreeEntry
              key={child.path}
              entry={child}
              depth={depth + 1}
              expandedDirectories={expandedDirectories}
              directories={directories}
              gitFileStatusByPath={gitFileStatusByPath}
              changedDirectoryPaths={changedDirectoryPaths}
              onOpenFile={onOpenFile}
              onToggleDirectory={onToggleDirectory}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function parentDirectory(targetPath: string, fallback: string): string {
  const parent = targetPath.replace(/[\\/][^\\/]*$/, "");
  return parent && parent !== targetPath ? parent : fallback;
}

function isChildPath(candidate: string, parent: string): boolean {
  const normalizedCandidate = normalizeGitPath(candidate);
  const normalizedParent = normalizeGitPath(parent);
  return normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function createGitFileStatusMap(gitStatus: GitStatus | null): Map<string, GitFileStatus> {
  const statusByPath = new Map<string, GitFileStatus>();
  gitStatus?.files.forEach((file) => {
    statusByPath.set(normalizeGitPath(file.path), file);
  });
  return statusByPath;
}

function createChangedDirectorySet(gitFileStatusByPath: Map<string, GitFileStatus>): Set<string> {
  const directories = new Set<string>();
  gitFileStatusByPath.forEach((_status, filePath) => {
    const parts = filePath.split("/");
    parts.pop();
    while (parts.length > 0) {
      directories.add(parts.join("/"));
      parts.pop();
    }
  });
  return directories;
}

function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function describeGitFileStatus(file: GitFileStatus): string {
  if (file.indexStatus === "?" || file.workingTreeStatus === "?") {
    return "Untracked";
  }
  if (file.indexStatus.trim() && file.workingTreeStatus.trim()) {
    return "Staged and modified";
  }
  if (file.indexStatus.trim()) {
    return "Staged";
  }
  return "Modified";
}
