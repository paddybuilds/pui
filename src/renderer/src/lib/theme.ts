import type { ITheme } from "@xterm/xterm";
import type { AppPreferences, AppThemeToken, AppThemeTokens, ThemePreset } from "../../../shared/types";

export type ThemeTokenField = {
  token: AppThemeToken;
  label: string;
  cssVariable: string;
};

export const THEME_TOKEN_FIELDS: ThemeTokenField[] = [
  { token: "surfaceRoot", label: "App background", cssVariable: "--surface-root" },
  { token: "surfaceSidebar", label: "Sidebar", cssVariable: "--surface-sidebar" },
  { token: "surfacePanel", label: "Panels", cssVariable: "--surface-panel" },
  { token: "surfaceRaised", label: "Raised surfaces", cssVariable: "--surface-raised" },
  { token: "surfaceHover", label: "Hover surface", cssVariable: "--surface-hover" },
  { token: "surfaceActive", label: "Active surface", cssVariable: "--surface-active" },
  { token: "lineSoft", label: "Soft border", cssVariable: "--line-soft" },
  { token: "lineStrong", label: "Strong border", cssVariable: "--line-strong" },
  { token: "textStrong", label: "Strong text", cssVariable: "--text-strong" },
  { token: "text", label: "Body text", cssVariable: "--text" },
  { token: "textMuted", label: "Muted text", cssVariable: "--text-muted" },
  { token: "textFaint", label: "Faint text", cssVariable: "--text-faint" },
  { token: "accent", label: "Accent", cssVariable: "--accent" },
  { token: "success", label: "Success", cssVariable: "--success" },
  { token: "warning", label: "Warning", cssVariable: "--warning" },
  { token: "danger", label: "Danger", cssVariable: "--danger" },
  { token: "terminalBackground", label: "Terminal background", cssVariable: "--terminal-background" },
  { token: "terminalForeground", label: "Terminal text", cssVariable: "--terminal-foreground" },
  { token: "terminalCursor", label: "Terminal cursor", cssVariable: "--terminal-cursor" },
  { token: "terminalSelection", label: "Terminal selection", cssVariable: "--terminal-selection" }
];

export const DARK_THEME_TOKENS: Record<AppThemeToken, string> = {
  surfaceRoot: "#090b0f",
  surfaceSidebar: "#0c1015",
  surfacePanel: "#0f1319",
  surfaceRaised: "#121821",
  surfaceHover: "rgba(148, 163, 184, 0.075)",
  surfaceActive: "rgba(148, 163, 184, 0.13)",
  lineSoft: "rgba(148, 163, 184, 0.09)",
  lineStrong: "rgba(148, 163, 184, 0.16)",
  textStrong: "#f1f5f9",
  text: "#d8dee6",
  textMuted: "#8b95a5",
  textFaint: "#5f6877",
  accent: "#8ab4ff",
  success: "#b8f7d4",
  warning: "#f5d38a",
  danger: "#ffb8b8",
  terminalBackground: "#10141a",
  terminalForeground: "#e8edf2",
  terminalCursor: "#e5e7eb",
  terminalSelection: "#334155"
};

export const LIGHT_THEME_TOKENS: Record<AppThemeToken, string> = {
  surfaceRoot: "#f6f8fb",
  surfaceSidebar: "#eef2f7",
  surfacePanel: "#ffffff",
  surfaceRaised: "#f1f5f9",
  surfaceHover: "rgba(15, 23, 42, 0.06)",
  surfaceActive: "rgba(37, 99, 235, 0.12)",
  lineSoft: "rgba(15, 23, 42, 0.12)",
  lineStrong: "rgba(15, 23, 42, 0.2)",
  textStrong: "#0f172a",
  text: "#243042",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  accent: "#2563eb",
  success: "#047857",
  warning: "#a16207",
  danger: "#b91c1c",
  terminalBackground: "#fbfdff",
  terminalForeground: "#111827",
  terminalCursor: "#0f172a",
  terminalSelection: "#bfdbfe"
};

export function resolveThemeTokens(
  preferences: Pick<AppPreferences, "themePreset" | "customTheme">,
  systemScheme: "light" | "dark" = getSystemScheme()
): Record<AppThemeToken, string> {
  const preset = resolvePreset(preferences.themePreset, systemScheme);
  const base = preset === "light" ? LIGHT_THEME_TOKENS : DARK_THEME_TOKENS;
  return { ...base, ...(preferences.customTheme ?? {}) };
}

export function applyThemePreferences(
  preferences: Pick<AppPreferences, "themePreset" | "density" | "customTheme">,
  root: HTMLElement = document.documentElement
): void {
  const systemScheme = getSystemScheme();
  const resolvedPreset = resolvePreset(preferences.themePreset, systemScheme);
  const tokens = resolveThemeTokens(preferences, systemScheme);
  root.dataset.theme = resolvedPreset;
  root.dataset.themePreference = preferences.themePreset;
  root.dataset.density = preferences.density;

  for (const field of THEME_TOKEN_FIELDS) {
    root.style.setProperty(field.cssVariable, tokens[field.token]);
  }
}

export function readTerminalTheme(root: HTMLElement = document.documentElement): ITheme {
  const styles = window.getComputedStyle(root);
  return {
    background: readCssVariable(styles, "--terminal-background", DARK_THEME_TOKENS.terminalBackground),
    foreground: readCssVariable(styles, "--terminal-foreground", DARK_THEME_TOKENS.terminalForeground),
    cursor: readCssVariable(styles, "--terminal-cursor", DARK_THEME_TOKENS.terminalCursor),
    selectionBackground: readCssVariable(styles, "--terminal-selection", DARK_THEME_TOKENS.terminalSelection)
  };
}

export function themeKey(preferences: Pick<AppPreferences, "themePreset" | "density" | "customTheme">): string {
  return JSON.stringify({
    themePreset: preferences.themePreset,
    density: preferences.density,
    customTheme: preferences.customTheme ?? {}
  });
}

function resolvePreset(themePreset: ThemePreset, systemScheme: "light" | "dark"): "light" | "dark" {
  return themePreset === "system" ? systemScheme : themePreset;
}

function getSystemScheme(): "light" | "dark" {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readCssVariable(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}

export function isPlainColorValue(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function compactThemeTokens(tokens: AppThemeTokens): AppThemeTokens | undefined {
  const next = Object.fromEntries(
    Object.entries(tokens)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value)
  ) as AppThemeTokens;
  return Object.keys(next).length ? next : undefined;
}
