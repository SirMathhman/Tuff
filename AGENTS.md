# tuff

Private Bun-based JavaScript library (ESM, `"type": "module"`). The public API is the set of symbols exported from `index.js` — the only surface consumers may depend on.

## Commands

- `bun install` — install dependencies
- `bun test` — run tests (Bun test runner; globals `test`/`expect`/`describe`/`it` are available)
- `bun run lint` — ESLint (`eslint.config.js`, ES2024 modules, Bun globals)

Run both `bun test` and `bun run lint` before committing; both must pass.

## Hooks

Deterministic checks run from `.github/hooks/` (PowerShell, invoked as `pwsh -File .github/hooks/<name>.ps1` from the repo root):

- `test.ps1` — `bun test` with coverage and a 10s timeout
- `lint.ps1` — ESLint
- `format.ps1` — Prettier auto-fix (`bunx prettier --write .`)
- `pmd-cpd.ps1` — copy/paste detection via PMD CPD (ecmascript, ≥100 tokens)
- `cap-children-per-directory.ps1` — max 10 direct children (files + subdirs) per directory
- `find-circular-files.ps1` — circular file dependencies via madge
- `find-circular-packages.ps1` — circular package (top-level directory) dependencies via madge

All hooks must exit 0. If a hook fails, fix the underlying issue (do not weaken the hook) and re-run it.

## Architecture

The canonical architecture document is in repo memory at `/memories/repo/architecture.md` (read it before structural changes). It is aspirational — follow it where it doesn't add complexity. Key invariants:

- **Single entry point**: all public exports flow through `index.js` (re-exports only, no logic). Internal modules live under `src/`, one directory per feature; consumers never import `src/` directly.
- **Result-style errors**: fallible operations return `{ ok: true, value }` / `{ ok: false, error }` with structured errors — do not `throw`.
- **Size limits**: max 100 lines per function, 500 code lines per file, 10 files per directory.
- **One-way dependencies**: `index.js → src/<feature> → src/shared`; no circular imports (madge is a devDependency for checking); cross-feature use goes through that feature's public exports.

## Conventions

- Tests are colocated/mirroring: `index.test.js` for the public API, `src/**/*.test.js` for units.
- `jsconfig.json` is strict (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, bundler resolution) — write code that satisfies it.
- Development is test-driven: new work typically starts as a failing test case; implement the minimum needed to make it pass, then run the full suite and lint.
