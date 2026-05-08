import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodeWorkspace } from "./CodeWorkspace";
import type { CodeFileTab } from "../lib/codeWorkspace";

vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    extensions,
    onChange
  }: {
    value: string;
    extensions: unknown[];
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Code editor"
      data-extension-count={extensions.length}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  )
}));

const tab: CodeFileTab = {
  kind: "text",
  path: "/repo/src/App.tsx",
  relativePath: "src/App.tsx",
  name: "App.tsx",
  contents: "before",
  savedContents: "before",
  dirty: false,
  loading: false,
  size: 6,
  modifiedAt: "2026-05-07T22:00:00.000Z"
};

describe("CodeWorkspace", () => {
  it("edits and saves the active tab", async () => {
    const onChange = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <CodeWorkspace
        platform="win32"
        autocompleteEnabled
        workspaceFilePaths={["src/App.tsx"]}
        tabs={[{ ...tab, contents: "after", dirty: true }]}
        activePath={tab.path}
        onActivate={vi.fn()}
        onChange={onChange}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Code editor"), { target: { value: "changed" } });
    expect(onChange).toHaveBeenLastCalledWith(tab.path, "changed");

    fireEvent.keyDown(screen.getByLabelText("Code workspace"), { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledWith(tab.path);
  });

  it("prompts before closing a dirty tab", async () => {
    const onClose = vi.fn();

    render(
      <CodeWorkspace
        platform="win32"
        autocompleteEnabled
        workspaceFilePaths={["src/App.tsx"]}
        tabs={[{ ...tab, dirty: true }]}
        activePath={tab.path}
        onActivate={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByLabelText("Close App.tsx"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledWith(tab.path);
  });

  it("opens a code pane context menu with save and split actions", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <CodeWorkspace
        platform="win32"
        autocompleteEnabled
        workspaceFilePaths={["src/App.tsx"]}
        tabs={[{ ...tab, dirty: true }]}
        activePath={tab.path}
        onActivate={vi.fn()}
        onChange={vi.fn()}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.contextMenu(screen.getByText("src/App.tsx"));
    expect(screen.getByRole("menu", { name: "Code editor context menu" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Save file" }));
    expect(onSave).toHaveBeenCalledWith(tab.path);

    fireEvent.contextMenu(screen.getByText("src/App.tsx"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Split right" }));
    expect(screen.getAllByText("src/App.tsx")).toHaveLength(2);
  });

  it("adds autocomplete extensions only when enabled", () => {
    const { rerender } = render(
      <CodeWorkspace
        platform="win32"
        autocompleteEnabled={false}
        workspaceFilePaths={["src/App.tsx"]}
        tabs={[tab]}
        activePath={tab.path}
        onActivate={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    const disabledCount = Number(screen.getByLabelText("Code editor").getAttribute("data-extension-count"));

    rerender(
      <CodeWorkspace
        platform="win32"
        autocompleteEnabled
        workspaceFilePaths={["src/App.tsx"]}
        tabs={[tab]}
        activePath={tab.path}
        onActivate={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );

    expect(Number(screen.getByLabelText("Code editor").getAttribute("data-extension-count"))).toBeGreaterThan(
      disabledCount
    );
  });

  it("renders images as read-only previews", () => {
    render(
      <CodeWorkspace
        platform="win32"
        autocompleteEnabled
        workspaceFilePaths={["assets/logo.png"]}
        tabs={[
          {
            ...tab,
            kind: "image",
            path: "/repo/assets/logo.png",
            relativePath: "assets/logo.png",
            name: "logo.png",
            contents: "",
            savedContents: "",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,iVBORw=="
          }
        ]}
        activePath="/repo/assets/logo.png"
        onActivate={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("img", { name: "logo.png" })).toHaveAttribute("src", "data:image/png;base64,iVBORw==");
    expect(screen.queryByLabelText("Code editor")).not.toBeInTheDocument();
    expect(screen.getByText("Image preview")).toBeInTheDocument();
  });
});
