import type { GitFileStatus } from "./types";

export type ParseGitStatusOptions = {
  trimPaths?: boolean;
};

export declare function parseGitStatus(output: string, options?: ParseGitStatusOptions): GitFileStatus[];
