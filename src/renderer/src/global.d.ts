import type { PuiApi } from "../../preload";

declare global {
  interface Window {
    pui: PuiApi;
  }
}

export {};
