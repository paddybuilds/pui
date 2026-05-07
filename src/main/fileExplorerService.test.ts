import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileExplorerService } from "./fileExplorerService";

describe("FileExplorerService", () => {
  it("lists workspace entries with directories first and noisy folders ignored", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "pui-files-"));
    await mkdir(path.join(workspace, "src"));
    await mkdir(path.join(workspace, "node_modules"));
    await writeFile(path.join(workspace, "README.md"), "");
    await writeFile(path.join(workspace, "src", "App.tsx"), "");

    const service = new FileExplorerService();
    await expect(service.readDirectory(workspace)).resolves.toEqual([
      {
        name: "src",
        path: path.join(workspace, "src"),
        relativePath: "src",
        kind: "directory"
      },
      {
        name: "README.md",
        path: path.join(workspace, "README.md"),
        relativePath: "README.md",
        kind: "file"
      }
    ]);
  });

  it("rejects directories outside the workspace", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "pui-files-"));
    const outside = await mkdtemp(path.join(tmpdir(), "pui-outside-"));
    const service = new FileExplorerService();

    await expect(service.readDirectory(workspace, outside)).rejects.toThrow("outside the active workspace");
  });

  it("reads text files inside the workspace with metadata", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "pui-files-"));
    const filePath = path.join(workspace, "README.md");
    await writeFile(filePath, "# Hello");
    const service = new FileExplorerService();

    await expect(service.readFile(workspace, filePath)).resolves.toMatchObject({
      name: "README.md",
      path: filePath,
      relativePath: "README.md",
      contents: "# Hello",
      size: 7
    });
  });

  it("lists workspace file paths with noisy folders ignored", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "pui-files-"));
    await mkdir(path.join(workspace, "src"));
    await mkdir(path.join(workspace, "node_modules"));
    await writeFile(path.join(workspace, "README.md"), "");
    await writeFile(path.join(workspace, "src", "App.tsx"), "");
    await writeFile(path.join(workspace, "node_modules", "ignored.js"), "");
    const service = new FileExplorerService();

    await expect(service.listFilePaths(workspace)).resolves.toEqual({
      workspace,
      paths: ["src/App.tsx", "README.md"],
      limit: 2000,
      truncated: false
    });
  });

  it("caps workspace file path listings", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "pui-files-"));
    await writeFile(path.join(workspace, "a.txt"), "");
    await writeFile(path.join(workspace, "b.txt"), "");
    const service = new FileExplorerService({ filePathLimit: 1 });

    await expect(service.listFilePaths(workspace)).resolves.toEqual({
      workspace,
      paths: ["a.txt"],
      limit: 1,
      truncated: true
    });
  });

  it("writes text files inside the workspace", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "pui-files-"));
    const filePath = path.join(workspace, "notes.txt");
    await writeFile(filePath, "before");
    const service = new FileExplorerService();

    await expect(service.writeFile(workspace, filePath, "after")).resolves.toMatchObject({
      path: filePath,
      relativePath: "notes.txt",
      size: 5
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe("after");
  });

  it("rejects files outside the workspace", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "pui-files-"));
    const outside = path.join(await mkdtemp(path.join(tmpdir(), "pui-outside-")), "secret.txt");
    await writeFile(outside, "secret");
    const service = new FileExplorerService();

    await expect(service.readFile(workspace, outside)).rejects.toThrow("outside the active workspace");
    await expect(service.writeFile(workspace, outside, "changed")).rejects.toThrow("outside the active workspace");
  });

  it("rejects directories and binary files", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "pui-files-"));
    const directory = path.join(workspace, "src");
    const binary = path.join(workspace, "image.bin");
    await mkdir(directory);
    await writeFile(binary, Buffer.from([0x89, 0x50, 0x00, 0x47]));
    const service = new FileExplorerService();

    await expect(service.readFile(workspace, directory)).rejects.toThrow("Only files can be opened");
    await expect(service.writeFile(workspace, directory, "changed")).rejects.toThrow("Only files can be saved");
    await expect(service.readFile(workspace, binary)).rejects.toThrow("Binary files cannot be opened");
  });
});
