import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileReadResult, FileSystemEntry, FileWriteResult } from "../shared/types";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "out", "dist", "release"]);
const MAX_TEXT_FILE_BYTES = 1024 * 1024;
const BINARY_SAMPLE_BYTES = 4096;

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

  async readFile(workspace: string, filePath: string): Promise<FileReadResult> {
    const workspaceRoot = path.resolve(workspace);
    const targetPath = this.resolveInsideWorkspace(workspaceRoot, filePath);
    const fileStat = await stat(targetPath);
    if (!fileStat.isFile()) {
      throw new Error("Only files can be opened in the code view.");
    }
    if (fileStat.size > MAX_TEXT_FILE_BYTES) {
      throw new Error("File is too large to open in the code view.");
    }

    const buffer = await readFile(targetPath);
    if (looksBinary(buffer)) {
      throw new Error("Binary files cannot be opened in the code view.");
    }

    return {
      path: targetPath,
      relativePath: path.relative(workspaceRoot, targetPath),
      name: path.basename(targetPath),
      contents: buffer.toString("utf8"),
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString()
    };
  }

  async writeFile(workspace: string, filePath: string, contents: string): Promise<FileWriteResult> {
    const workspaceRoot = path.resolve(workspace);
    const targetPath = this.resolveInsideWorkspace(workspaceRoot, filePath);
    const fileStat = await stat(targetPath);
    if (!fileStat.isFile()) {
      throw new Error("Only files can be saved from the code view.");
    }

    await writeFile(targetPath, contents, "utf8");
    const nextStat = await stat(targetPath);
    return {
      path: targetPath,
      relativePath: path.relative(workspaceRoot, targetPath),
      size: nextStat.size,
      modifiedAt: nextStat.mtime.toISOString()
    };
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

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, BINARY_SAMPLE_BYTES);
  return sample.includes(0);
}

function compareFileSystemEntries(left: FileSystemEntry, right: FileSystemEntry): number {
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1;
  }
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
}
