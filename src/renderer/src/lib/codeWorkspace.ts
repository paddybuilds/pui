import type { FileReadResult } from "../../../shared/types";

export type WorkspaceView = "terminal" | "code";

export type CodeFileTab = {
  path: string;
  relativePath: string;
  name: string;
  contents: string;
  savedContents: string;
  dirty: boolean;
  loading: boolean;
  error?: string;
  size?: number;
  modifiedAt?: string;
};

export function createLoadingCodeTab(path: string): CodeFileTab {
  const name = path.split(/[\\/]/).pop() || path;
  return {
    path,
    relativePath: name,
    name,
    contents: "",
    savedContents: "",
    dirty: false,
    loading: true
  };
}

export function createLoadedCodeTab(file: FileReadResult): CodeFileTab {
  return {
    path: file.path,
    relativePath: file.relativePath,
    name: file.name,
    contents: file.contents,
    savedContents: file.contents,
    dirty: false,
    loading: false,
    size: file.size,
    modifiedAt: file.modifiedAt
  };
}

export function upsertCodeTab(tabs: CodeFileTab[], tab: CodeFileTab): CodeFileTab[] {
  return tabs.some((item) => item.path === tab.path)
    ? tabs.map((item) => (item.path === tab.path ? { ...item, ...tab } : item))
    : [...tabs, tab];
}

export function updateCodeTabContents(tabs: CodeFileTab[], path: string, contents: string): CodeFileTab[] {
  return tabs.map((tab) =>
    tab.path === path
      ? {
          ...tab,
          contents,
          dirty: contents !== tab.savedContents,
          error: undefined
        }
      : tab
  );
}

export function markCodeTabSaved(
  tabs: CodeFileTab[],
  path: string,
  metadata: { size: number; modifiedAt: string }
): CodeFileTab[] {
  return tabs.map((tab) =>
    tab.path === path
      ? {
          ...tab,
          savedContents: tab.contents,
          dirty: false,
          loading: false,
          error: undefined,
          size: metadata.size,
          modifiedAt: metadata.modifiedAt
        }
      : tab
  );
}

export function markCodeTabError(tabs: CodeFileTab[], path: string, error: string): CodeFileTab[] {
  return tabs.map((tab) => (tab.path === path ? { ...tab, loading: false, error } : tab));
}

export function nextActiveCodeTabPath(
  tabs: CodeFileTab[],
  closingPath: string,
  activePath?: string
): string | undefined {
  const remainingTabs = tabs.filter((tab) => tab.path !== closingPath);
  if (activePath !== closingPath) {
    return activePath;
  }
  const closedIndex = tabs.findIndex((tab) => tab.path === closingPath);
  return remainingTabs[Math.max(0, closedIndex - 1)]?.path ?? remainingTabs[0]?.path;
}
