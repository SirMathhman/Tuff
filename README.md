# Tuff

Small TypeScript project that compiles a tiny custom language into JavaScript and evaluates it.

## Bundling multiple files

This repo now supports bundling multiple `.tuff` files into one JS expression via `compileBundle`.

- API: `compileBundle(files: Map<string, string>, entry: string, options?: { modulesRoot?: string })`
- Output: a JavaScript _expression string_ that evaluates to the entry file's result.

### Java-like `modules/` layout (minimal)

Tuff is evolving toward Java-like packaging. For now, bundling supports a minimal convention:

- `from tuff::stuff use { getMyValue };` resolves to `modules/tuff/stuff/provider.tuff` (or `${modulesRoot}/tuff/stuff/provider.tuff`).
- `out` declarations are treated as normal declarations for compilation (e.g. `out fn` → `fn`).

Example:

- `modules/tuff/stuff/provider.tuff`
  - `out fn getMyValue() => 100;`
- `modules/tuff/stuff/user.tuff`
  - `from tuff::stuff use { getMyValue };`
  - `getMyValue()`

## Scripts

- `npm test` — run Jest
- `npm run lint` — run ESLint

## ESLint guardrails

This repo enforces a few strict rules to keep the codebase maintainable:

- `max-lines-per-function`: 50 (skipping blank lines and comments)
- `max-lines`: 500 per file (skipping blank lines and comments)

When a file grows too large, we split it into focused modules (e.g., compiler helpers under `src/compiler/`).
