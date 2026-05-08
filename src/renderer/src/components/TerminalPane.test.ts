import { describe, expect, it } from "vitest";
import { prepareTerminalPasteData } from "./TerminalPane";

describe("TerminalPane clipboard handling", () => {
  it("normalizes pasted newlines for terminal input", () => {
    expect(prepareTerminalPasteData("one\ntwo\r\nthree", false)).toBe("one\rtwo\rthree");
  });

  it("wraps pasted text when bracketed paste mode is active", () => {
    expect(prepareTerminalPasteData("npm test\n", true)).toBe("\x1b[200~npm test\r\x1b[201~");
  });
});
