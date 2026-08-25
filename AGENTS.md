# Tuff — Agent Instructions

## Runtime & Tooling

| Tool               | Command                           |
| ------------------ | --------------------------------- |
| Run                | `bun index.ts`                    |
| Test               | `bun test`                        |
| Lint & type-check  | `bun lint`                        |
| Call graph         | `bun callgraph` → `callgraph.svg` |
| Call graph (watch) | `bun callgraph:watch`             |
| Circular deps      | `bun madge:circular`              |
| Duplicates         | `bun pmd:cpd`                     |

## Conventions

- **Bun ESM** — `"type": "module"`, `"module": "Preserve"`, no transpilation (`noEmit: true`)
- **Strict TS** — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`
- **Source files** — `src/**/*.ts` for app code; `tools/` for dev utilities; `*.test.ts` for tests
- **JSDoc required** — `jsdoc/check-syntax: error`; add JSDoc to exported functions and classes
- **Size limits** — warn at 500 lines/file, 100 lines/function (blanks and comments excluded)
- **callgraph tool** skips `tools/` and `*.test.ts` files, excludes `node_modules` and dotfiles
