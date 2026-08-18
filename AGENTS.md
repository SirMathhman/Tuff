# AGENTS.md

Guidance for AI coding agents working in this repo.

## Runtime

This project runs on **Bun**, not Node. Use `bun` for all package and script commands — do not reach for `npm`, `npx`, or `node`.

## Commands

- Install deps: `bun install`
- Run the entrypoint: `bun run index.ts`

There is no build step, test runner, or linter configured yet. `tsconfig.json` sets `noEmit: true`, so TypeScript is type-checked but not compiled to output.

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
