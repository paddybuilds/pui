import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodeWorkspace } from "./CodeWorkspace";
import type { CodeFileTab } from "../lib/codeWorkspace";

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="Code editor" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
  )
}));

const tab: CodeFileTab = {
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
});
