import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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
});
