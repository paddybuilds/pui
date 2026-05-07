import type { AppSettings, TerminalWorkspace, WorkbenchNode, WorkbenchPane } from "../../../shared/types";

export type IdFactory = () => string;

export const createWorkbenchId: IdFactory = () => crypto.randomUUID();

export function updateWorkspaceLayoutInSettings(
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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeSplitSizes(sizes: number[] | undefined, childCount: number): number[] {
  if (childCount <= 0) {
    return [];
  }
  const normalized = Array.from({ length: childCount }, (_, index) => {
    const value = sizes?.[index];
    return Number.isFinite(value) && value && value > 0 ? value : 1;
  });
  const total = normalized.reduce((sum, value) => sum + value, 0);
  return total > 0
    ? normalized.map((value) => value / total)
    : Array.from({ length: childCount }, () => 1 / childCount);
}

export function buildSplitTracks(sizes: number[], resizerSize: number): string {
  return sizes.map((size, index) => `${size}fr${index < sizes.length - 1 ? ` ${resizerSize}px` : ""}`).join(" ");
}

export function resizeAdjacentSplitSizes(
  sizes: number[],
  boundaryIndex: number,
  deltaPixels: number,
  dimensionPixels: number
): number[] {
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

export function updateSplitSizes(root: WorkbenchNode, splitId: string, sizes: number[]): WorkbenchNode {
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

export function appendWorkbenchNode(
  root: WorkbenchNode,
  child: WorkbenchNode,
  direction: "right" | "down",
  idFactory: IdFactory = createWorkbenchId
): WorkbenchNode {
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
    id: idFactory(),
    direction,
    children: [root, child],
    sizes: [0.65, 0.35]
  };
}

export function remapProfileIds(root: WorkbenchNode, profileIdMap: Map<string, string>): WorkbenchNode {
  if (root.type === "pane") {
    return {
      ...root,
      profileId: root.profileId ? (profileIdMap.get(root.profileId) ?? root.profileId) : root.profileId
    };
  }
  return {
    ...root,
    children: root.children.map((child) => remapProfileIds(child, profileIdMap))
  };
}

export function cloneWorkbenchNode(root: WorkbenchNode): WorkbenchNode {
  if (root.type === "pane") {
    return { ...root };
  }
  return {
    ...root,
    sizes: root.sizes ? [...root.sizes] : undefined,
    children: root.children.map(cloneWorkbenchNode)
  };
}

export function cloneWorkbenchNodeWithNewIds(
  root: WorkbenchNode,
  activePaneId: string,
  idFactory: IdFactory = createWorkbenchId
): { root: WorkbenchNode; activePaneId: string } {
  const idMap = new Map<string, string>();
  const clone = (node: WorkbenchNode): WorkbenchNode => {
    const id = idFactory();
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

export function normalizeLayoutRoot(
  layout: TerminalWorkspace["layout"],
  fallbackProfileId: string | undefined,
  validProfileIds: Set<string>,
  idFactory: IdFactory = createWorkbenchId
): WorkbenchNode {
  if (layout.root) {
    return normalizeNode(layout.root, fallbackProfileId, validProfileIds, idFactory);
  }

  const panes =
    layout.panes && layout.panes.length > 0 ? layout.panes : [{ id: idFactory(), profileId: fallbackProfileId }];
  const normalizedPanes = panes.map((pane) => ({
    type: "pane" as const,
    id: pane.id || idFactory(),
    profileId: pane.profileId && validProfileIds.has(pane.profileId) ? pane.profileId : fallbackProfileId
  }));

  if (normalizedPanes.length === 1) {
    return normalizedPanes[0];
  }

  return {
    type: "split",
    id: idFactory(),
    direction: layout.direction ?? "right",
    children: normalizedPanes,
    sizes: normalizeSplitSizes(undefined, normalizedPanes.length)
  };
}

function normalizeNode(
  node: WorkbenchNode,
  fallbackProfileId: string | undefined,
  validProfileIds: Set<string>,
  idFactory: IdFactory
): WorkbenchNode {
  if (node.type === "pane") {
    return {
      ...node,
      id: node.id || idFactory(),
      profileId: node.profileId && validProfileIds.has(node.profileId) ? node.profileId : fallbackProfileId
    };
  }

  const children = node.children
    .map((child) => normalizeNode(child, fallbackProfileId, validProfileIds, idFactory))
    .filter(Boolean);
  if (children.length === 1) {
    return children[0];
  }
  return { ...node, id: node.id || idFactory(), children, sizes: normalizeSplitSizes(node.sizes, children.length) };
}

export function collectPanes(node: WorkbenchNode): WorkbenchPane[] {
  if (node.type === "pane") {
    return [{ id: node.id, profileId: node.profileId }];
  }
  return node.children.flatMap(collectPanes);
}

export function splitPane(
  root: WorkbenchNode,
  targetPaneId: string,
  direction: "right" | "down",
  newPane: WorkbenchPane,
  idFactory: IdFactory = createWorkbenchId
): WorkbenchNode {
  if (root.type === "pane") {
    if (root.id !== targetPaneId) {
      return root;
    }
    return {
      type: "split",
      id: idFactory(),
      direction,
      children: [root, { type: "pane", id: newPane.id, profileId: newPane.profileId }],
      sizes: [0.5, 0.5]
    };
  }

  return {
    ...root,
    children: root.children.map((child) => splitPane(child, targetPaneId, direction, newPane, idFactory))
  };
}

export function removePane(root: WorkbenchNode, targetPaneId: string): WorkbenchNode | null {
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
  return {
    ...root,
    children,
    sizes: normalizeSplitSizes(
      retained.map((item) => item.size),
      children.length
    )
  };
}
