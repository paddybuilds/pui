import { describe, expect, it } from "vitest";
import { buildCodexExecArgs } from "./codexCommand";

describe("buildCodexExecArgs", () => {
  it("builds the stable JSONL Codex exec command", () => {
    expect(buildCodexExecArgs("fix tests", "/tmp/repo")).toEqual(["exec", "--json", "--cd", "/tmp/repo", "fix tests"]);
  });

  it("includes optional model and sandbox choices", () => {
    expect(buildCodexExecArgs("review", "/tmp/repo", { model: "gpt-5.4", sandbox: "workspace-write" })).toEqual([
      "exec",
      "--json",
      "--cd",
      "/tmp/repo",
      "--model",
      "gpt-5.4",
      "--sandbox",
      "workspace-write",
      "review"
    ]);
  });
});
