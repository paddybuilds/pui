# Pui

Pui is a personal macOS Electron terminal folder workspace with Codex CLI integration.

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

- PTY-backed folder terminals with split panes.
- Folder-specific terminal setups.
- Command palette with `Cmd+K`.
- Interactive Codex use through normal terminal profiles.
- Persistent Git sidebar when the active folder is inside a Git repo.
- Live Git status and diff panel with recent commits, stage, unstage, and confirmed discard actions.
- Local app settings persisted through Electron app data.
