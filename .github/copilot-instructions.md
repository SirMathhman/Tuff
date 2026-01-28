# GitHub Copilot Instructions — Tuff ⚡️

## Purpose
Provide brief, actionable guidance for AI coding agents working in this repository so they can be productive immediately.

---

## Quickstart (essential commands) ✅
- Install deps: `pnpm install`
- Run tests: `pnpm test` (Jest with `ts-jest` preset; tests live under `tests/`)
- Type-check only: `pnpm typecheck` (runs `tsc --noEmit`)
- Build for production: `pnpm build` (`tsc` → outputs to `dist/`)
- Run dev without build: `pnpm dev` (`ts-node src/index.ts`)
- Lint: `pnpm lint` (ESLint flat config in `eslint.config.cjs`)
- Format: `pnpm format` (Prettier)

---

## High-level architecture & intent 💡
- This is a single-package TypeScript library/project.
- Source: `src/` (rootDir in `tsconfig.json`). Compiled output written to `dist/` (outDir).
- `package.json` points `main` to `dist/index.js` and `types` to `dist/index.d.ts`.
- Tests reside in `tests/` and use `ts-jest` so they run directly against TypeScript sources.
- Keep the code focused, small and export-focused. Example: `src/index.ts` exports `add(a: number, b: number): number`.

---

## Developer workflows & patterns 🔧
- When adding runtime code, put it under `src/` and export from `src/index.ts` if it should be part of the public API.
- Add unit tests to `tests/` using the same import path pattern as existing tests, e.g.:
  - `import { add } from '../src/index';`
- Prefer pure, small functions with explicit TypeScript types (project is `strict: true`).
- Use `pnpm dev` for quick manual testing; run `pnpm build` before `pnpm start` in production flows.

---

## Linting, formatting & pre-commit hooks 🧹
- ESLint configuration: `eslint.config.cjs` (flat config using `@typescript-eslint` + `prettier`).
- Ignore `dist` and `node_modules` in linting.
- Husky + lint-staged are configured: pre-commit runs `pnpm lint --fix` and `pnpm format` on staged `src/**/*.{ts,tsx}`.
- Important: **Always commit final changes _without_ using `--no-verify`.** Respect pre-commit hooks — fix any errors reported by Husky or lint-staged before committing.

---

## Tests & CI notes 🧪
- Jest preset: `ts-jest`; test root is `tests/` (see `jest.config.cjs`).
- Use `pnpm test` or `npx jest -t "pattern"` to run specific tests.
- No GitHub Actions CI workflow is present in the repo — add one if you expect remote runs.

---

## Common pitfalls & tips ⚠️
- Remember to run `pnpm build` before relying on `dist/` (e.g., `node dist/index.js`).
- Type-checking is enforced by `pnpm typecheck` — use it when making type-heavy changes.
- ESLint warns on unused vars; arguments prefixed with `_` are ignored by rule (`argsIgnorePattern: '^_'`).

---

## Files to check when making changes 🔍
- `README.md` — high-level project overview and quick commands
- `src/` — source code
- `tests/` — unit tests
- `tsconfig.json` — compiler options (target, module, rootDir, outDir)
- `jest.config.cjs` — test runner config
- `eslint.config.cjs` — linting rules
- `package.json` — scripts and devDependencies

---