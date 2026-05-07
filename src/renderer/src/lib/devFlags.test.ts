import { describe, expect, it } from "vitest";
import { resolveDevToolsEnabled } from "./devFlags";

describe("resolveDevToolsEnabled", () => {
  it("enables dev tools by default during development", () => {
    expect(resolveDevToolsEnabled({ dev: true })).toMatchObject({
      enabled: true,
      source: "development"
    });
  });

  it("keeps dev tools hidden by default outside development", () => {
    expect(resolveDevToolsEnabled({ dev: false })).toMatchObject({
      enabled: false,
      source: "default"
    });
  });

  it("lets the environment flag disable the development default", () => {
    expect(resolveDevToolsEnabled({ dev: true, flag: "0" })).toMatchObject({
      enabled: false,
      source: "environment"
    });
  });

  it("lets local storage opt into dev tools when not in development", () => {
    expect(resolveDevToolsEnabled({ dev: false, storage: "enabled" })).toMatchObject({
      enabled: true,
      source: "localStorage"
    });
  });

  it("lets the URL flag override stored and environment values", () => {
    expect(resolveDevToolsEnabled({ dev: true, flag: "1", storage: "1", query: "false" })).toMatchObject({
      enabled: false,
      source: "url"
    });
  });
});
