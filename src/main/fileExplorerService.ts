import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FilePathListResult, FileReadResult, FileSystemEntry, FileWriteResult } from "../shared/types";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "out", "dist", "release"]);
const MAX_TEXT_FILE_BYTES = 1024 * 1024;
const MAX_PREVIEW_FILE_BYTES = 25 * 1024 * 1024;
const BINARY_SAMPLE_BYTES = 4096;
const DEFAULT_FILE_PATH_LIMIT = 2000;
const PREVIEW_MIME_TYPES = new Map<string, { kind: "image" | "pdf"; mimeType: string }>([
  [".avif", { kind: "image", mimeType: "image/avif" }],
  [".bmp", { kind: "image", mimeType: "image/bmp" }],
  [".gif", { kind: "image", mimeType: "image/gif" }],
  [".ico", { kind: "image", mimeType: "image/x-icon" }],
  [".jpeg", { kind: "image", mimeType: "image/jpeg" }],
  [".jpg", { kind: "image", mimeType: "image/jpeg" }],
  [".pdf", { kind: "pdf", mimeType: "application/pdf" }],
  [".png", { kind: "image", mimeType: "image/png" }],
  [".svg", { kind: "image", mimeType: "image/svg+xml" }],
  [".webp", { kind: "image", mimeType: "image/webp" }]
]);

type FileExplorerServiceOptions = {
  filePathLimit?: number;
};

export class FileExplorerService {
  private readonly filePathLimit: number;

  constructor(options: FileExplorerServiceOptions = {}) {
    this.filePathLimit = options.filePathLimit ?? DEFAULT_FILE_PATH_LIMIT;
  }

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

  async listFilePaths(workspace: string): Promise<FilePathListResult> {
    const workspaceRoot = path.resolve(workspace);
    const rootStat = await stat(workspaceRoot);
    if (!rootStat.isDirectory()) {
      throw new Error("Workspace path must be a directory.");
    }

    const paths: string[] = [];
    await this.collectFilePaths(workspaceRoot, workspaceRoot, paths);
    return {
      workspace: workspaceRoot,
      paths,
      limit: this.filePathLimit,
      truncated: paths.length >= this.filePathLimit
    };
  }

  async readFile(workspace: string, filePath: string): Promise<FileReadResult> {
    const workspaceRoot = path.resolve(workspace);
    const targetPath = this.resolveInsideWorkspace(workspaceRoot, filePath);
    const fileStat = await stat(targetPath);
    if (!fileStat.isFile()) {
      throw new Error("Only files can be opened in the code view.");
    }

    const previewType = PREVIEW_MIME_TYPES.get(path.extname(targetPath).toLowerCase());
    if (previewType) {
      if (fileStat.size > MAX_PREVIEW_FILE_BYTES) {
        throw new Error("File is too large to preview in the code view.");
      }
      const buffer = await readFile(targetPath);
      return {
        kind: previewType.kind,
        path: targetPath,
        relativePath: path.relative(workspaceRoot, targetPath),
        name: path.basename(targetPath),
        contents: "",
        mimeType: previewType.mimeType,
        dataUrl: `data:${previewType.mimeType};base64,${buffer.toString("base64")}`,
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString()
      };
    }

    if (fileStat.size > MAX_TEXT_FILE_BYTES) {
      throw new Error("File is too large to open in the code view.");
    }

    const buffer = await readFile(targetPath);
    if (looksBinary(buffer)) {
      throw new Error("Binary files cannot be opened in the code view.");
    }

    return {
      kind: "text",
      path: targetPath,
      relativePath: path.relative(workspaceRoot, targetPath),
      name: path.basename(targetPath),
      contents: buffer.toString("utf8"),
      mimeType: "text/plain",
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

  private async collectFilePaths(workspaceRoot: string, directory: string, paths: string[]): Promise<void> {
    if (paths.length >= this.filePathLimit) {
      return;
    }

    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort(compareDirectoryEntries)) {
      if (paths.length >= this.filePathLimit) {
        return;
      }
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.collectFilePaths(workspaceRoot, entryPath, paths);
        continue;
      }
      if (entry.isFile()) {
        paths.push(toWorkspacePath(path.relative(workspaceRoot, entryPath)));
      }
    }
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

function compareDirectoryEntries(
  left: { name: string; isDirectory: () => boolean },
  right: { name: string; isDirectory: () => boolean }
): number {
  const leftIsDirectory = left.isDirectory();
  const rightIsDirectory = right.isDirectory();
  if (leftIsDirectory !== rightIsDirectory) {
    return leftIsDirectory ? -1 : 1;
  }
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
}

function toWorkspacePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}
