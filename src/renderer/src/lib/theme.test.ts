import { describe, expect, it } from "vitest";
import { DEFAULT_APP_PREFERENCES } from "../../../shared/types";
import {
  applyThemePreferences,
  compactThemeTokens,
  DARK_THEME_TOKENS,
  LIGHT_THEME_TOKENS,
  readTerminalTheme,
  resolveThemeTokens,
  themeKey
} from "./theme";

describe("theme helpers", () => {
  it("resolves preset theme tokens with custom overrides", () => {
    expect(
      resolveThemeTokens(
        {
          themePreset: "light",
          customTheme: {
            accent: "#ff00aa",
            terminalBackground: "#101010"
          }
        },
        "dark"
      )
    ).toMatchObject({
      ...LIGHT_THEME_TOKENS,
      accent: "#ff00aa",
      terminalBackground: "#101010"
    });
  });

  it("uses the system scheme for system theme preferences", () => {
    expect(resolveThemeTokens({ themePreset: "system" }, "dark")).toMatchObject(DARK_THEME_TOKENS);
    expect(resolveThemeTokens({ themePreset: "system" }, "light")).toMatchObject(LIGHT_THEME_TOKENS);
  });

  it("applies theme preferences as root data attributes and CSS variables", () => {
    const root = document.createElement("div");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false })
    });

    applyThemePreferences(
      {
        ...DEFAULT_APP_PREFERENCES,
        themePreset: "dark",
        density: "compact",
        customTheme: {
          accent: "#33cc99",
          terminalForeground: "#fafafa"
        }
      },
      root
    );

    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.themePreference).toBe("dark");
    expect(root.dataset.density).toBe("compact");
    expect(root.style.getPropertyValue("--accent")).toBe("#33cc99");
    expect(root.style.getPropertyValue("--terminal-foreground")).toBe("#fafafa");
  });

  it("reads terminal theme variables", () => {
    const root = document.createElement("div");
    root.style.setProperty("--terminal-background", "#010203");
    root.style.setProperty("--terminal-foreground", "#aabbcc");
    root.style.setProperty("--terminal-cursor", "#ddeeff");
    root.style.setProperty("--terminal-selection", "#112233");
    document.body.append(root);

    expect(readTerminalTheme(root)).toEqual({
      background: "#010203",
      foreground: "#aabbcc",
      cursor: "#ddeeff",
      selectionBackground: "#112233"
    });

    root.remove();
  });

  it("compacts theme tokens and generates stable keys", () => {
    expect(compactThemeTokens({ accent: " #fff ", danger: "" })).toEqual({ accent: "#fff" });
    expect(compactThemeTokens({ accent: " " })).toBeUndefined();
    expect(themeKey({ themePreset: "dark", density: "comfortable" })).toContain('"themePreset":"dark"');
  });
});
