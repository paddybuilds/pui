export type DiffLine = {
  type: "meta" | "add" | "remove" | "context";
  text: string;
};

export function splitDiff(text: string): DiffLine[] {
  return text.split(/\r?\n/).map((line) => {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") || line.startsWith("diff ")) {
      return { type: "meta", text: line };
    }
    if (line.startsWith("+")) {
      return { type: "add", text: line };
    }
    if (line.startsWith("-")) {
      return { type: "remove", text: line };
    }
    return { type: "context", text: line };
  });
}
