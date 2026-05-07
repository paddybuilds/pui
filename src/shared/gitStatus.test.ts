import { describe, expect, it } from "vitest";
import { parseGitStatus } from "./gitStatus";

describe("parseGitStatus", () => {
  it("parses index and working tree status", () => {
    expect(parseGitStatus(" M src/App.tsx\nA  src/main.ts\nR  old.ts -> new.ts\n")).toEqual([
      { path: "src/App.tsx", indexStatus: " ", workingTreeStatus: "M" },
      { path: "src/main.ts", indexStatus: "A", workingTreeStatus: " " },
      { path: "new.ts", indexStatus: "R", workingTreeStatus: " " }
    ]);
  });
});
