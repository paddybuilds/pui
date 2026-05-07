export type DiffLine = {
  type: "meta" | "add" | "remove" | "context";
  text: string;
  oldLine?: number;
  newLine?: number;
};

export function splitDiff(text: string): DiffLine[] {
  let oldLine: number | undefined;
  let newLine: number | undefined;

  return text.split(/\r?\n/).map((line) => {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { type: "meta", text: line };
    }

    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") || line.startsWith("diff ")) {
      return { type: "meta", text: line };
    }

    if (line.startsWith("+")) {
      const diffLine = { type: "add" as const, text: line, newLine };
      newLine = newLine === undefined ? undefined : newLine + 1;
      return diffLine;
    }

    if (line.startsWith("-")) {
      const diffLine = { type: "remove" as const, text: line, oldLine };
      oldLine = oldLine === undefined ? undefined : oldLine + 1;
      return diffLine;
    }

    const diffLine = { type: "context" as const, text: line, oldLine, newLine };
    oldLine = oldLine === undefined ? undefined : oldLine + 1;
    newLine = newLine === undefined ? undefined : newLine + 1;
    return diffLine;
  });
}
