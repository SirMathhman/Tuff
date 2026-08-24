# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

`tuff` — a JavaScript project running on the [Bun](https://bun.com) runtime (created via `bun init`). ESM throughout (`"type": "module"`).

## Commands

| Task                   | Command                  |
| ---------------------- | ------------------------ |
| Install dependencies   | `bun install`            |
| Run the app            | `bun run index.js`       |
| Run tests              | `bun test`               |
| Run a single test file | `bun test index.test.js` |

Tests use Bun's built-in test runner (`bun:test`); test files live at the repo root next to the code they cover (`index.test.js` ↔ `index.js`).

## Conventions

- **Strictness**: `jsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `verbatimModuleSyntax`. Write code that satisfies these (e.g., handle possibly-`undefined` index access, use `import type` for type-only imports).
- **Runtime**: Bun APIs (`bun:test`, `Bun.file`, etc.) are available; `@types/bun` is a dev dependency.
- **No build step**: `noEmit` is set; there is no bundler or transpile pipeline.

## Notes

- The project is in its initial scaffold stage; update this file as architecture and conventions emerge.
