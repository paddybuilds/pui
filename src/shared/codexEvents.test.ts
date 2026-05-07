import { describe, expect, it } from "vitest";
import { parseCodexLine } from "./codexEvents";

describe("parseCodexLine", () => {
  it("parses structured JSONL events", () => {
    const event = parseCodexLine(JSON.stringify({ type: "agent_message", message: "done" }));

    expect(event.type).toBe("agent_message");
    expect(event.message).toBe("done");
    expect(event.raw).toMatchObject({ type: "agent_message", message: "done" });
  });

  it("falls back to raw output for non-json lines", () => {
    const event = parseCodexLine("plain output");

    expect(event.type).toBe("output");
    expect(event.message).toBe("plain output");
  });
});
