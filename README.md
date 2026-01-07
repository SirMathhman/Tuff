# Tuff Interpreter

A tiny TypeScript interpreter / expression evaluator used for practicing parsing and interpretation.

## Commands

- `pnpm test` — run the Vitest test suite
- `pnpm lint` — run ESLint
- `pnpm cpd` — run duplicate-code detection (PMD CPD)
- `pnpm build` — typecheck / build with `tsc`
- `pnpm run check-dir-files` — check that no directory has more than 10 files (ignoring `node_modules`)

## Notes

- The repository uses a pre-commit hook that runs tests, lint, and CPD.
- Generated test artifacts (`tests/**/*.js`, `tests/**/*.d.ts`) are intentionally ignored and should not be committed.

> Tip: Run `pnpm run check-dir-files` to check for directories with too many files (ignores `node_modules`).
