import { readdir } from "node:fs/promises";
import path from "node:path";
import type { FileSystemEntry } from "../shared/types";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "out", "dist", "release"]);

export class FileExplorerService {
  async readDirectory(workspace: string, directory?: string): Promise<FileSystemEntry[]> {
    const workspaceRoot = path.resolve(workspace);
    const targetDirectory = this.resolveInsideWorkspace(workspaceRoot, directory || workspaceRoot);
    const entries = await readdir(targetDirectory, { withFileTypes: true });

    return entries
      .filter((entry) => !entry.isDirectory() || !IGNORED_DIRECTORIES.has(entry.name))
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => {
        const entryPath = path.join(targetDirectory, entry.name);
        const relativePath = path.relative(workspaceRoot, entryPath);
        return {
          name: entry.name,
          path: entryPath,
          relativePath,
          kind: entry.isDirectory() ? ("directory" as const) : ("file" as const)
        };
      })
      .sort(compareFileSystemEntries);
  }

  private resolveInsideWorkspace(workspaceRoot: string, requestedPath: string): string {
    const resolvedPath = path.resolve(requestedPath);
    const relativePath = path.relative(workspaceRoot, resolvedPath);
    if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
      return resolvedPath;
    }
    throw new Error("Directory is outside the active workspace.");
  }
}

function compareFileSystemEntries(left: FileSystemEntry, right: FileSystemEntry): number {
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1;
  }
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
}
