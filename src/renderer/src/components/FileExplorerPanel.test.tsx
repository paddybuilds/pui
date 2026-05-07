import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileExplorerPanel } from "./FileExplorerPanel";

describe("FileExplorerPanel", () => {
  it("opens files through the provided callback", async () => {
    const onOpenFile = vi.fn();

    render(
      <FileExplorerPanel
        workspace="C:\\Users\\paddy\\Documents\\GitHub\\pui"
        workspaceName="pui"
        gitStatus={null}
        onOpenFile={onOpenFile}
      />
    );

    fireEvent.click(await screen.findByRole("treeitem", { name: /package\.json/i }));
    expect(onOpenFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "package.json",
        kind: "file"
      })
    );
  });
});
