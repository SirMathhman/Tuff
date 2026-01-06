# Tuff

A tiny TypeScript interpreter with a strict lint + test gate.

## Scripts

- `npm test` – run Jest tests
- `npm run lint` – run ESLint over `src/`
- `npm run cpd` – run PMD CPD duplication checks

## Notes

### Lint rule: do not pass `this` as an argument

This repo enforces a custom ESLint rule (`local/no-this-argument`) that disallows passing `this` directly as a function/constructor argument (e.g. `helper(this)`).

If you need to pass the current instance, capture an alias first (e.g. `const self = this; helper(self)`), or refactor so the helper is a method.

The interpreter is organized into small modules under `src/`.

- `src/parser.ts` contains the main `Parser` implementation.
- `src/scopes.ts` manages scope storage for parser instances.
- `src/typeConformance.ts` contains type checking helpers used by the parser.
