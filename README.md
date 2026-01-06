# Tuff

A tiny TypeScript interpreter with a strict lint + test gate.

## Scripts

- `npm test` – run Jest tests
- `npm run lint` – run ESLint over `src/`
- `npm run cpd` – run PMD CPD duplication checks

## Notes

### Lint rule: `@typescript-eslint/no-this-alias`

This repo enforces `@typescript-eslint/no-this-alias` as an error, which disallows aliasing `this` to a local variable (e.g. `const self = this`).

This repo also enforces a small local rule (`local/no-simple-getters`) that disallows trivial private `get*()` methods that only return a backing field (e.g. `private getX() { return this.x; }`).

The interpreter is organized into small modules under `src/`.

- `src/parser.ts` contains the main `Parser` implementation.
- `src/scopes.ts` manages scope storage for parser instances.
- `src/typeConformance.ts` contains type checking helpers used by the parser.
