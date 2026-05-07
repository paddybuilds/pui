import { describe, expect, it } from "vitest";
import { splitDiff } from "./diff";

describe("splitDiff", () => {
  it("classifies unified diff lines", () => {
    expect(splitDiff("@@ -1 +1 @@\n-old\n+new\n same").map((line) => line.type)).toEqual([
      "meta",
      "remove",
      "add",
      "context"
    ]);
  });

  it("tracks old and new line numbers from hunks", () => {
    expect(splitDiff("@@ -10,2 +20,2 @@\n-old\n+new\n same").slice(1)).toEqual([
      { type: "remove", text: "-old", oldLine: 10 },
      { type: "add", text: "+new", newLine: 20 },
      { type: "context", text: " same", oldLine: 11, newLine: 21 }
    ]);
  });
});
