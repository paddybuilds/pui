import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { App } from "./App";

const platform = window.pui?.platform ?? (navigator.platform.toLowerCase().includes("mac") ? "darwin" : "browser");
document.documentElement.dataset.platform = platform;
document.body.classList.add(`platform-${platform}`);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
