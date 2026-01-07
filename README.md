# Tuff

Small TypeScript project that compiles a tiny custom language into JavaScript and evaluates it.

## Scripts

- `npm test` — run Jest
- `npm run lint` — run ESLint

## ESLint guardrails

This repo enforces a few strict rules to keep the codebase maintainable:

- `max-lines-per-function`: 50 (skipping blank lines and comments)
- `max-lines`: 500 per file (skipping blank lines and comments)

When a file grows too large, we split it into focused modules (e.g., compiler helpers under `src/compiler/`).
