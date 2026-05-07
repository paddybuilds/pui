# Contributing to Pui

Thanks for helping make Pui better. This project is a local-first developer
workspace, so the best contributions are focused, predictable, and careful with
users' terminals, folders, and Git repositories.

## Ways to Contribute

- Report bugs with clear reproduction steps and environment details.
- Suggest focused improvements that fit Pui's terminal workspace direction.
- Improve tests, docs, accessibility, and developer experience.
- Open pull requests for scoped fixes or features after checking for existing issues.

## Development Setup

Prerequisites:

- macOS.
- Node.js 22.12 or newer.
- npm 10 or newer.
- Xcode Command Line Tools for native modules.

Install dependencies:

```sh
npm install
```

Run the app locally:

```sh
npm run dev
```

## Quality Checks

Before opening a pull request, run the checks that apply to your change:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm audit --audit-level=moderate
```

The project CI expects these scripts. If a script is unavailable in your local
checkout while setup work is in progress, mention that in your pull request.

## Pull Request Guidelines

- Keep pull requests focused on one behavior, fix, or documentation topic.
- Include tests for behavior changes and regressions when practical.
- Update docs when changing setup, commands, configuration, or user-visible behavior.
- Avoid unrelated formatting churn.
- Describe user impact, implementation notes, and verification performed.
- Call out any risks around filesystem access, shell execution, terminal state, or Git operations.

## Code Style

- Prefer existing patterns before introducing new abstractions.
- Keep Electron main, preload, renderer, and shared boundaries clear.
- Treat shell commands, file paths, and Git operations as untrusted inputs unless proven otherwise.
- Prefer explicit confirmation for destructive or hard-to-recover actions.
- Keep UI states understandable and keyboard-friendly.

## Community Expectations

Everyone participating in Pui must follow the [Code of Conduct](CODE_OF_CONDUCT.md).
For vulnerabilities or security-sensitive concerns, use the process in
[SECURITY.md](SECURITY.md).
