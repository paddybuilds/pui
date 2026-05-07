export const DEV_TOOLS_STORAGE_KEY = "pui.devTools";

export type DevToolsFlagSource = "url" | "localStorage" | "environment" | "development" | "default";

export type DevToolsFlagState = {
  enabled: boolean;
  source: DevToolsFlagSource;
  label: string;
};

export type DevToolsFlagInput = {
  dev: boolean;
  flag?: string;
  query?: string | null;
  storage?: string | null;
};

export function getDevToolsFlagState(): DevToolsFlagState {
  return resolveDevToolsEnabled({
    dev: import.meta.env.DEV,
    flag: import.meta.env.VITE_PUI_DEV_TOOLS,
    query: new URLSearchParams(window.location.search).get("puiDevTools"),
    storage: readStoredFlag()
  });
}

export function resolveDevToolsEnabled(input: DevToolsFlagInput): DevToolsFlagState {
  const queryValue = parseBooleanFlag(input.query, { emptyMeansTrue: true });
  if (queryValue !== undefined) {
    return {
      enabled: queryValue,
      source: "url",
      label: `URL puiDevTools=${input.query ?? ""}`
    };
  }

  const storedValue = parseBooleanFlag(input.storage);
  if (storedValue !== undefined) {
    return {
      enabled: storedValue,
      source: "localStorage",
      label: `${DEV_TOOLS_STORAGE_KEY}=${input.storage}`
    };
  }

  const environmentValue = parseBooleanFlag(input.flag);
  if (environmentValue !== undefined) {
    return {
      enabled: environmentValue,
      source: "environment",
      label: `VITE_PUI_DEV_TOOLS=${input.flag}`
    };
  }

  if (input.dev) {
    return {
      enabled: true,
      source: "development",
      label: "Vite development mode"
    };
  }

  return {
    enabled: false,
    source: "default",
    label: "Production default"
  };
}

function readStoredFlag(): string | null {
  try {
    return window.localStorage.getItem(DEV_TOOLS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseBooleanFlag(
  value: string | null | undefined,
  options: { emptyMeansTrue?: boolean } = {}
): boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return options.emptyMeansTrue ? true : undefined;
  }

  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }

  return undefined;
}
