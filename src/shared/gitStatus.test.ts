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

  it("handles CRLF output without trimming porcelain paths", () => {
    expect(parseGitStatus("?? spaced file.txt \r\n")).toEqual([
      { path: "spaced file.txt ", indexStatus: "?", workingTreeStatus: "?" }
    ]);
  });

  it("can trim paths for the terminal bridge compatibility path", () => {
    expect(parseGitStatus("?? spaced file.txt \r\n", { trimPaths: true })).toEqual([
      { path: "spaced file.txt", indexStatus: "?", workingTreeStatus: "?" }
    ]);
  });
});
