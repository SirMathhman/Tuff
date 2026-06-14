# AGENTS.md - Tuff Language Interpreter

## Project Overview

**Tuff** is a custom programming language interpreter written in TypeScript, running on Bun. It implements a tokenizer → parser → evaluator pipeline supporting variables, mutability, arrays, functions, conditionals (`if/else`), loops (`while`, `for`), and type annotations (e.g., `I32`, `U8`).

## Commands

| Command        | Description                                      |
| -------------- | ------------------------------------------------ |
| `bun test`     | Run tests (But built-in runner)                  |
| `npm run lint` | Type-check + ESLint (`tsc --noEmit && eslint .`) |

Tests have a **90% coverage threshold** configured in `bunfig.toml`.

## Architecture

```
src/
├── index.ts              # Entry point: executeTuff(source) -> number
├── tokenizer.ts          # Lexer: string -> Token[]
├── parser-expressions.ts # PR-style expression parser + type inference
├── parser-declarations.ts# Parses let/mut/fn declarations with types, pointers, refinements
├── evaluator-statements.ts # Processes statements (assignments, blocks, control flow)
├── shared-state.ts       # WeakMaps for scope metadata (mutability, type annotations, etc.)
└── types.ts              # Shared TypeScript types (Token, ScopeValue, FnDef, EvalContext)
```

### Data Flow

1. `executeTuff(source)` in **index.ts** is the public API
2. Source is split into statements via `splitStatements()` (semicolon-aware, respects nesting)
3. Statements are classified: declarations (`let`), assignments (`x = ...`), function defs (`fn`), or expressions
4. The tokenizer produces a flat `Token[]` queue
5. The expression parser uses recursive descent with PR-style token consumption
6. Scope is a `Map<string, ScopeValue>` passed through the call chain; metadata (mutability, type annotations) lives in **WeakMaps** keyed by scope instance

### Key Conventions

- **Circular dependency**: `parser-expressions.ts` needs `resolveBlocksWithScope` from `evaluator-statements.ts`, resolved via a lazy setter (`setResolveBlocks`)
- **Scope metadata**: Mutability, type annotations, pointer targets, and non-zero refinements are tracked in WeakMaps (see `shared-state.ts`)
- **Type system**: Default type is `I32`; suffixes like `U8`, `F64` carry bit-width info. Type promotion/widening logic lives in `parser-expressions.ts`

## Pitfalls

- **Parser queue / EOF loops**: If the parser emits queued statements via syntax-lowering, EOF loops must drain the queue (`while !eof || queue.length > 0`) or trailing lowered declarations will be silently dropped
- **ASI gotcha**: Never format dynamically generated JS with a newline after `return` (i.e., `return \n /* comment */ ...`). Automatic Semicolon Insertion treats it as `return;`, causing unexpected `undefined` returns
- **Coverage threshold**: The 90% threshold in `bunfig.toml` is strict. Some edge-case branches may be genuinely hard to cover
