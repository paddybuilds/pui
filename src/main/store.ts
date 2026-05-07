import Store from "electron-store";
import type { AppSettings } from "../shared/types";
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

  saveSettings(settings: AppSettings): AppSettings {
    const recentWorkspaces = Array.from(
      new Set([settings.workspace, ...settings.recentWorkspaces].filter(Boolean))
    ).slice(0, 12);
    const next = { ...settings, recentWorkspaces };
    this.store.set("settings", next);
    return next;
  }
}
