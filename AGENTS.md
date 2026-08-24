# AGENTS.md

`tuff` is a private, Bun-based JavaScript library (ESM, `type: module`, ES2024). It is early-stage: `index.js` is the public entry point and is currently empty; a placeholder test exists in `index.test.js`.

## Commands

| Task            | Command                                              |
| --------------- | ---------------------------------------------------- |
| Install         | `bun install`                                        |
| Test            | `bun test` (coverage: `bun test --coverage`)         |
| Lint (auto-fix) | `bunx eslint . --fix`                                |
| Format          | `bunx prettier --write .`                            |
| Circular deps   | `bunx madge . --circular --extensions js,mjs,cjs,ts` |

## Quality gates (hooks)

PowerShell scripts in `.github/hooks/` are the project's quality gates; they must pass:

- `test.ps1` — `bun test --coverage`, 120s timeout.
- `lint.ps1` — ESLint with `--fix`; **fails if auto-fix modified any file** (commit the fixes).
- `format.ps1` — Prettier write + check.
- `cap-children-per-directory.ps1` — max 20 tracked files per directory; create subdirectories.
- `find-circular-files.ps1` — madge circular-dependency check.
- `pmd-cpd.ps1` — PMD CPD copy-paste detection (≥100 tokens); extract duplications.

If a request conflicts with a hook, implement the request first, then make the hooks pass (add the needed tests).

## Invariants

- **Single entry point**: all public exports flow through `index.js` (re-exports only, no logic). Consumers never import from `src/` directly.
- **Result-style errors**: fallible operations return structured results (`{ ok: true, value }` / `{ ok: false, error }`), never `throw`. Errors are structured (discriminated union), not plain strings.
- **Size limits**: ≤100 lines per function, ≤500 code lines per file, ≤10 files per directory (aspirational; the hook enforces a hard cap of 20).
- **No circular dependencies** between modules; cross-feature use goes through a feature's own public exports.
- **No copy-pasted code** — extract shared logic.

## Conventions

- ESM imports; `jsconfig.json` is strict (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`).
- Prettier: single quotes, trailing commas (see `.prettierrc`).
- Tests: `*.test.js` colocated with or mirroring source; Bun test globals (`test`, `expect`, `describe`, `it`) are available without imports.
- ESLint globals for Bun and test APIs are configured in `eslint.config.js`; unused-var args matching `^_` are allowed.

## Pitfalls

- The lint hook treats auto-fix changes as a failure — run lint, then commit the fixes.
- `where` can be misleading on this machine; try running a tool directly before installing it.
- Keep `index.js` a pure re-export surface; if it accumulates logic, split into per-feature entry modules.
