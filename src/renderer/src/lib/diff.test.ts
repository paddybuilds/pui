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
});
