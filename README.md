# Pui

Pui is a macOS-focused Electron workspace for working across project folders with
PTY-backed terminals, Git context, and Codex CLI workflows close at hand.

The project is early, but it is being prepared for open-source collaboration.
Contributions that keep the app focused, local-first, and pleasant for day-to-day
developer work are welcome.

## Features

- PTY-backed folder terminals with split panes.
- Folder-specific terminal setups.
- Command palette with `Cmd+K`.
- Interactive Codex use through normal terminal profiles.
- Persistent Git sidebar when the active folder is inside a Git repo.
- Live Git status and diff panel with recent commits, stage, unstage, and confirmed discard actions.
- Local app settings persisted through Electron app data.

## Requirements

- macOS for the primary app experience.
- Node.js 22.12 or newer.
- npm 10 or newer.
- Xcode Command Line Tools, required by native dependencies such as `node-pty`.

## Getting Started

Install dependencies:

```sh
npm install
```

Start the development app:

```sh
npm run dev
```

The dev command starts the Electron renderer at `http://localhost:5173/` and
launches the native Electron window.

## Development

Use small, reviewable changes and keep platform-specific behavior explicit. Pui
touches terminals, local folders, and Git repositories, so changes should favor
clear user intent, predictable file-system behavior, and recoverable actions.

Useful commands:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm audit --audit-level=moderate
```

Some quality scripts may be added by adjacent setup work. The CI workflow treats
the commands above as the expected project contract.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
All participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

For security-sensitive reports, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## License

Pui is licensed under the [MIT License](LICENSE).
