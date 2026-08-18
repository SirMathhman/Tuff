# AGENTS.md

Guidance for AI coding agents working in this repo.

## Runtime

This project runs on **Bun**, not Node. Use `bun` for all package and script commands — do not reach for `npm`, `npx`, or `node`.

## Commands

- Install deps: `bun install`
- Run the entrypoint: `bun run src/index.ts`
- Run tests: `bun test`
- Lint: `bun run lint:eslint`
- Check directory clutter: `bun run check:clutter`

There is no build step. `tsconfig.json` sets `noEmit: true`, so TypeScript is type-checked but not compiled to output.

## Architecture

Source lives in `src/`, tests in `test/`, helper scripts in `scripts/`. The evaluator is split into small modules (eslint enforces `max-lines` of 300 per file — keep files under that):

- `src/errors.ts` — `EvalErrorCode` enum, `EvalResult`/`EvalError` types, `err()` helper.
- `src/tokens.ts` — token types and `tokenize()`.
- `src/env.ts` — `Binding` and `Env` types.
- `src/expressions.ts` — `parseExpression`/`parseTerm`/`parseFactor` (arithmetic, parens, `*` deref).
- `src/assignments.ts` — `parseBindingValue` (`let` values and `&[mut]` refs), `parseAssignment`, `parseDerefAssignment`.
- `src/statements.ts` — `parseLetBinding`, `parseStatements`, `parseBlock`.
- `src/index.ts` — `evaluate()` entrypoint; re-exports `EvalErrorCode`.
- `scripts/check-clutter.ts` — fails if any git-tracked directory has more than 15 immediate children (a `Stop` hook enforces this).

Dependency direction is one-way: `statements` → `assignments` → `expressions` → `errors`/`tokens`/`env`. `expressions` and `statements` are mutually recursive, so `parseBlock` is passed in as a `ParseBlockFn` callback rather than imported — do not create a circular import between them.

## TypeScript conventions

`tsconfig.json` is strict and bundler-oriented. These flags change how code should be written:

- `strict: true` — no implicit `any`, null checks required.
- `noUncheckedIndexedAccess: true` — index access (`obj[key]`, `arr[i]`) yields `T | undefined`; handle the undefined case.
- `verbatimModuleSyntax: true` — use `import type` for type-only imports; value imports are preserved as written.
- `noImplicitOverride: true` — mark overriding members with `override`.
- `moduleResolution: "bundler"` + `allowImportingTsExtensions: true` — imports may use explicit `.ts` extensions.

The project is ESM (`"type": "module"`).

## Notes

- `@types/bun` is the type source (`"types": ["bun"]`); prefer Bun APIs over Node-specific ones where a Bun equivalent exists.
- This is an early-stage scaffold. As architecture, tests, or tooling are added, update this file so agents stay oriented.
