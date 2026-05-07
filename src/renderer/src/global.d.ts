import type { PuiApi } from "../../preload";

declare global {
  interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly MODE: string;
    readonly VITE_PUI_DEV_TOOLS?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    pui: PuiApi;
  }
}

export {};
