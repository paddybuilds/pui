import type { FileReadResult } from "../../../shared/types";

export type WorkspaceView = "terminal" | "code";

export type CodeFileTab = {
  kind: FileReadResult["kind"];
  path: string;
  relativePath: string;
  name: string;
  contents: string;
  savedContents: string;
  mimeType?: string;
  dataUrl?: string;
  dirty: boolean;
  loading: boolean;
  error?: string;
  size?: number;
  modifiedAt?: string;
};

export type CodeEditorGroup = {
  type: "group";
  id: string;
  activePath?: string;
};

export type CodeEditorNode =
  | CodeEditorGroup
  | {
      type: "split";
      id: string;
      direction: "right" | "down";
      children: CodeEditorNode[];
      sizes?: number[];
    };

export function createLoadingCodeTab(path: string): CodeFileTab {
  const name = path.split(/[\\/]/).pop() || path;
  return {
    path,
    kind: "text",
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
    kind: file.kind,
    relativePath: file.relativePath,
    name: file.name,
    contents: file.contents,
    savedContents: file.contents,
    mimeType: file.mimeType,
    dataUrl: file.dataUrl,
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

export function createCodeEditorGroup(id: string, activePath?: string): CodeEditorGroup {
  return { type: "group", id, activePath };
}

export function collectCodeEditorGroups(node: CodeEditorNode): CodeEditorGroup[] {
  if (node.type === "group") {
    return [node];
  }
  return node.children.flatMap((child) => collectCodeEditorGroups(child));
}

export function setCodeEditorGroupPath(node: CodeEditorNode, groupId: string, activePath?: string): CodeEditorNode {
  if (node.type === "group") {
    return node.id === groupId ? { ...node, activePath } : node;
  }
  return {
    ...node,
    children: node.children.map((child) => setCodeEditorGroupPath(child, groupId, activePath))
  };
}

export function splitCodeEditorGroup(
  node: CodeEditorNode,
  groupId: string,
  direction: "right" | "down",
  ids: { splitId: string; groupId: string },
  activePath?: string
): CodeEditorNode {
  if (node.type === "group") {
    if (node.id !== groupId) {
      return node;
    }
    return {
      type: "split",
      id: ids.splitId,
      direction,
      children: [node, createCodeEditorGroup(ids.groupId, activePath ?? node.activePath)],
      sizes: [0.5, 0.5]
    };
  }
  return {
    ...node,
    children: node.children.map((child) => splitCodeEditorGroup(child, groupId, direction, ids, activePath))
  };
}

export function removeCodeEditorGroup(node: CodeEditorNode, groupId: string): CodeEditorNode | null {
  if (node.type === "group") {
    return node.id === groupId ? null : node;
  }

  const children = node.children
    .map((child) => removeCodeEditorGroup(child, groupId))
    .filter((child): child is CodeEditorNode => Boolean(child));

  if (children.length === 0) {
    return null;
  }
  if (children.length === 1) {
    return children[0];
  }

  return {
    ...node,
    children,
    sizes: normalizeCodeSplitSizes(node.sizes, children.length)
  };
}

export function updateCodeSplitSizes(node: CodeEditorNode, splitId: string, sizes: number[]): CodeEditorNode {
  if (node.type === "group") {
    return node;
  }
  return {
    ...node,
    sizes: node.id === splitId ? normalizeCodeSplitSizes(sizes, node.children.length) : node.sizes,
    children: node.children.map((child) => updateCodeSplitSizes(child, splitId, sizes))
  };
}

export function normalizeCodeSplitSizes(sizes: number[] | undefined, count: number): number[] {
  if (count <= 0) {
    return [];
  }
  if (!sizes || sizes.length !== count || sizes.some((size) => !Number.isFinite(size) || size <= 0)) {
    return Array.from({ length: count }, () => 1 / count);
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return sizes.map((size) => size / total);
}

export function resizeAdjacentCodeSplitSizes(
  sizes: number[],
  boundaryIndex: number,
  deltaPixels: number,
  totalPixels: number
): number[] {
  if (boundaryIndex < 0 || boundaryIndex >= sizes.length - 1 || totalPixels <= 0) {
    return sizes;
  }
  const next = [...sizes];
  const delta = deltaPixels / totalPixels;
  const left = Math.max(0.12, next[boundaryIndex] + delta);
  const right = Math.max(0.12, next[boundaryIndex + 1] - delta);
  const pairTotal = next[boundaryIndex] + next[boundaryIndex + 1];
  const adjustedTotal = left + right;
  next[boundaryIndex] = (left / adjustedTotal) * pairTotal;
  next[boundaryIndex + 1] = (right / adjustedTotal) * pairTotal;
  return normalizeCodeSplitSizes(next, sizes.length);
}
