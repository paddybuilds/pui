import type { CodexEvent } from "./types";

export function parseCodexLine(line: string): CodexEvent {
  const timestamp = new Date().toISOString();

  try {
    const raw = JSON.parse(line) as Record<string, unknown>;
    const type = String(raw.type ?? raw.event ?? "event");
    const message =
      readString(raw, ["message", "text", "content", "summary"]) ||
      readNestedString(raw, ["item", "message", "content"]) ||
      JSON.stringify(raw);

    return { timestamp, type, message, raw };
  } catch {
    return {
      timestamp,
      type: "output",
      message: line,
      raw: line
    };
  }
}

function readString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === "string") {
      return value[key] as string;
    }
  }
  return undefined;
}

function readNestedString(value: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}
