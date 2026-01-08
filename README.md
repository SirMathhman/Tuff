# Tuff

A small TypeScript interpreter project.

## Dev

- Install deps with pnpm
- Run tests with `pnpm test`

## Notes

- Block expressions (`{ ... }`) are lexically scoped: declarations inside a braced block do not leak outward.
- Constructor-style functions that return `this` expose any nested `fn` declarations as methods (e.g., `Point(3, 4).manhattan()`).
- The codebase avoids explicit TypeScript `any` (prefer `unknown` + narrowing/type guards) and avoids `Record<...>` types (prefer `Map`).
