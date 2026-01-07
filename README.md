# Tuff Interpreter

A tiny TypeScript interpreter / expression evaluator used for practicing parsing and interpretation.

## Commands

- `pnpm test` — run the Vitest test suite
- `pnpm lint` — run ESLint
- `pnpm cpd` — run duplicate-code detection (PMD CPD)
- `pnpm build` — typecheck / build with `tsc`

## Notes

- The repository uses a pre-commit hook that runs tests, lint, and CPD.
- Generated test artifacts (`tests/**/*.js`, `tests/**/*.d.ts`) are intentionally ignored and should not be committed.
