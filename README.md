# Pui

Pui is a personal macOS Electron terminal workspace with Codex CLI integration.

## Run

```sh
npm install
npm run dev
```

The dev command starts the Electron renderer at `http://localhost:5173/` and launches the native Electron window.

## Build And Test

```sh
npm test
npm run build
```

## MVP Features

- PTY-backed workspace terminals with split panes.
- Workspace-specific terminal setups.
- Command palette with `Cmd+K`.
- Codex side panel using `codex exec --json --cd <workspace>`.
- Codex and diff drawers kept out of the default terminal view.
- Live Git status and diff panel with stage, unstage, and confirmed discard actions.
- Local app settings persisted through Electron app data.
