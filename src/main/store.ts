import Store from "electron-store";
import { existsSync, readFileSync } from "node:fs";
import type { AppSettings, SettingsLoadState } from "../shared/types";
import { defaultSettings } from "./defaults";

type Schema = {
  settings: AppSettings;
};

export class StoreService {
  private readonly store = new Store<Schema>({
    name: "pui-settings",
    defaults: {
      settings: defaultSettings()
    }
  });

  loadSettings(): AppSettings {
    return this.store.get("settings");
  }

  loadSettingsState(): SettingsLoadState {
    return {
      settings: this.loadSettings(),
      isFirstLaunch: !hasPersistedSettings(this.store.path)
    };
  }

  saveSettings(settings: AppSettings): AppSettings {
    const recentWorkspaces = Array.from(
      new Set([settings.workspace, ...settings.recentWorkspaces].filter(Boolean))
    ).slice(0, 12);
    const next = { ...settings, recentWorkspaces };
    this.store.set("settings", next);
    return next;
  }
}

export function hasPersistedSettings(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }

  try {
    const payload = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isRecord(payload) && Object.prototype.hasOwnProperty.call(payload, "settings");
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
