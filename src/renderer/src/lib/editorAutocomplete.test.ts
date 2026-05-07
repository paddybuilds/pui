import type { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { codeCompletionSource } from "./editorAutocomplete";
import type { CodeFileTab } from "./codeWorkspace";

const tab: CodeFileTab = {
  path: "/repo/src/App.tsx",
  relativePath: "src/App.tsx",
  name: "App.tsx",
  contents: "const workspaceTitle = createWorkspaceTitle();\nfunction renderWorkspace() {}",
  savedContents: "",
  dirty: false,
  loading: false,
  size: 0,
  modifiedAt: "2026-05-07T22:00:00.000Z"
};

describe("editor autocomplete", () => {
  it("suggests words from open tabs", () => {
    const source = codeCompletionSource([tab], []);
    const state = EditorState.create({ doc: "work" });
    const result = source(createCompletionContext(state, 4));

    expect(result?.options.map((option) => option.label)).toContain("workspaceTitle");
  });

  it("suggests workspace paths in import strings", () => {
    const source = codeCompletionSource([], ["src/App.tsx", "src/lib/codeWorkspace.ts"]);
    const state = EditorState.create({ doc: 'import item from "./src/A' });
    const result = source(createCompletionContext(state, state.doc.length));

    expect(result?.options.map((option) => option.label)).toContain("./src/App.tsx");
  });

  it("returns no implicit suggestions outside a word or path context", () => {
    const source = codeCompletionSource([tab], ["src/App.tsx"]);
    const state = EditorState.create({ doc: "  " });

    expect(source(createCompletionContext(state, 2))).toBeNull();
  });
});

function createCompletionContext(state: EditorState, pos: number, explicit = false): CompletionContext {
  return {
    state,
    pos,
    explicit,
    matchBefore: (expression: RegExp) => {
      const text = state.sliceDoc(0, pos);
      const match = text.match(new RegExp(`${expression.source}$`, expression.flags));
      if (!match) {
        return null;
      }
      const matchedText = match[0];
      return { from: pos - matchedText.length, to: pos, text: matchedText };
    }
  } as CompletionContext;
}
