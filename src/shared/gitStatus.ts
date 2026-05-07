import type { GitFileStatus } from "./types";

export function parseGitStatus(output: string): GitFileStatus[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const indexStatus = line[0] || " ";
      const workingTreeStatus = line[1] || " ";
      const rawPath = line.slice(3);
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) || rawPath : rawPath;
      return { path, indexStatus, workingTreeStatus };
    });
}
