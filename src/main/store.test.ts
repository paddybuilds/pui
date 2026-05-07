import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasPersistedSettings } from "./store";

let tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories = [];
});

function tempFile(contents?: string): string {
  const directory = mkdtempSync(join(tmpdir(), "pui-store-"));
  tempDirectories.push(directory);
  const path = join(directory, "settings.json");
  if (contents !== undefined) {
    writeFileSync(path, contents);
  }
  return path;
}

describe("store helpers", () => {
  it("detects whether settings were persisted outside defaults", () => {
    expect(hasPersistedSettings(tempFile())).toBe(false);
    expect(hasPersistedSettings(tempFile("{}"))).toBe(false);
    expect(hasPersistedSettings(tempFile("{not json"))).toBe(false);
    expect(hasPersistedSettings(tempFile(JSON.stringify({ settings: { workspace: "/repo" } })))).toBe(true);
  });
});
