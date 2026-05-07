import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { CodeFileTab } from "./codeWorkspace";

const MIN_WORD_LENGTH = 3;
const MAX_WORD_SUGGESTIONS = 80;
const MAX_PATH_SUGGESTIONS = 80;
const WORD_PATTERN = /[A-Za-z_$][\w$-]{2,}/g;

export function codeAutocompleteExtension(tabs: CodeFileTab[], workspaceFilePaths: string[]): Extension {
  return autocompletion({
    activateOnTyping: true,
    override: [codeCompletionSource(tabs, workspaceFilePaths)]
  });
}

export function codeCompletionSource(
  tabs: CodeFileTab[],
  workspaceFilePaths: string[]
): (context: CompletionContext) => CompletionResult | null {
  const wordOptions = buildWordCompletions(tabs);
  const pathOptions = buildPathCompletions(workspaceFilePaths);

  return (context) => {
    const pathContext = matchPathContext(context);
    if (pathContext) {
      const options = filterPathCompletions(pathOptions, pathContext.query);
      if (options.length === 0 && !context.explicit) {
        return null;
      }
      return {
        from: pathContext.from,
        options,
        validFor: /^[\w./@~-]*$/
      };
    }

    const word = context.matchBefore(/[A-Za-z_$][\w$-]*/);
    if (!word || (word.from === word.to && !context.explicit)) {
      return null;
    }
    const query = word.text.toLowerCase();
    const options = wordOptions
      .filter((option) => option.label.toLowerCase().startsWith(query))
      .slice(0, MAX_WORD_SUGGESTIONS);
    if (options.length === 0 && !context.explicit) {
      return null;
    }
    return {
      from: word.from,
      options,
      validFor: /^[A-Za-z_$][\w$-]*$/
    };
  };
}

export function buildWordCompletions(tabs: CodeFileTab[]): Completion[] {
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const tab of tabs.filter((item) => item.kind === "text")) {
    for (const match of tab.contents.matchAll(WORD_PATTERN)) {
      const word = match[0];
      if (word.length < MIN_WORD_LENGTH || seen.has(word)) {
        continue;
      }
      seen.add(word);
      options.push({
        label: word,
        type: classifyWordCompletion(word)
      });
    }
  }
  return options.sort(compareCompletionLabels);
}

export function buildPathCompletions(paths: string[]): Completion[] {
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const filePath of paths) {
    const normalized = filePath.replaceAll("\\", "/");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    options.push({ label: normalized, type: "file" });
    options.push({ label: `./${normalized}`, type: "file" });
  }
  return options.sort(compareCompletionLabels).slice(0, MAX_PATH_SUGGESTIONS * 2);
}

function matchPathContext(context: CompletionContext): { from: number; query: string } | null {
  const before = context.state.sliceDoc(Math.max(0, context.pos - 240), context.pos);
  const match = before.match(/(?:from\s+|import\s*(?:\(\s*)?|require\(\s*)?["'`]([^"'`]*)$/);
  if (!match) {
    return null;
  }
  const query = match[1] ?? "";
  return {
    from: context.pos - query.length,
    query
  };
}

function filterPathCompletions(options: Completion[], query: string): Completion[] {
  const normalizedQuery = query.replaceAll("\\", "/").toLowerCase();
  return options
    .filter((option) => option.label.toLowerCase().startsWith(normalizedQuery))
    .slice(0, MAX_PATH_SUGGESTIONS);
}

function classifyWordCompletion(word: string): Completion["type"] {
  if (/^[A-Z]/.test(word)) {
    return "class";
  }
  if (/^[a-z_$][\w$-]*$/.test(word)) {
    return "variable";
  }
  return "text";
}

function compareCompletionLabels(left: Completion, right: Completion): number {
  return left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true });
}
