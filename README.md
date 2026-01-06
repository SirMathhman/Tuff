# Tuff

A tiny TypeScript interpreter with a strict lint + test gate.

## Scripts

- `npm test` – run Jest tests
- `npm run lint` – run ESLint over `src/`
- `npm run cpd` – run PMD CPD duplication checks

## Notes

The interpreter is organized into small modules under `src/`.

- `src/parser.ts` contains the main `Parser` implementation.
- `src/scopes.ts` manages scope storage for parser instances.
- `src/typeConformance.ts` contains type checking helpers used by the parser.
