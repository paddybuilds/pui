import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, RefreshCw } from "lucide-react";
import type { FileSystemEntry } from "../../../shared/types";
import { getPuiApi } from "../lib/browserApi";

type FileExplorerPanelProps = {
  workspace: string;
  workspaceName: string;
};

type DirectoryState = {
  entries: FileSystemEntry[];
  loading: boolean;
  error?: string;
};

const pui = getPuiApi();

export function FileExplorerPanel({ workspace, workspaceName }: FileExplorerPanelProps) {
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set([workspace]));
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({});

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

  return (
    <div className="file-explorer-panel">
      <div className="file-explorer-header">
        <div>
          <strong>Explorer</strong>
          <span title={workspace}>{workspaceName}</span>
        </div>
        <button type="button" title="Refresh explorer" aria-label="Refresh explorer" onClick={refresh}>
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="file-tree" role="tree" aria-label={`${workspaceName} files`}>
        {rootState?.loading && rootEntries.length === 0 ? <div className="empty-state">Loading files.</div> : null}
        {rootState?.error ? <div className="empty-state">{rootState.error}</div> : null}
        {rootEntries.map((entry) => (
          <FileTreeEntry
            key={entry.path}
            entry={entry}
            depth={0}
            expandedDirectories={expandedDirectories}
            directories={directories}
            onToggleDirectory={toggleDirectory}
          />
        ))}
        {!rootState?.loading && !rootState?.error && rootEntries.length === 0 ? (
          <div className="empty-state">No files found.</div>
        ) : null}
      </div>
    </div>
  );
}

function FileTreeEntry({
  entry,
  depth,
  expandedDirectories,
  directories,
  onToggleDirectory
}: {
  entry: FileSystemEntry;
  depth: number;
  expandedDirectories: Set<string>;
  directories: Record<string, DirectoryState>;
  onToggleDirectory: (entry: FileSystemEntry) => void;
}) {
  const isDirectory = entry.kind === "directory";
  const expanded = isDirectory && expandedDirectories.has(entry.path);
  const directoryState = directories[entry.path];

  return (
    <>
      <button
        type="button"
        className="file-tree-row"
        style={{ "--file-tree-depth": depth } as CSSProperties}
        title={entry.path}
        role="treeitem"
        aria-expanded={isDirectory ? expanded : undefined}
        onClick={() => {
          if (isDirectory) {
            onToggleDirectory(entry);
          }
        }}
      >
        <span className="file-tree-chevron" aria-hidden="true">
          {isDirectory ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
        </span>
        {isDirectory ? <Folder size={14} /> : <File size={14} />}
        <span>{entry.name}</span>
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
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
