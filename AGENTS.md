# Project Guidelines

## Overview
Tuff is a tiny compiled language with a 4-stage pipeline:
`tokenize → parse → validateScopes → generateJS`.
The compiler targets JavaScript (Bun runtime) and compiles Tuff source to a `process.exit(...)` JS program.

## Build and Test
- **Runtime**: Bun v1.3.14
- **Install**: `bun install`
- **Test**: `bun test`
- **Lint**: `bun run lint` (runs `tsc --noEmit && eslint . --fix`)
- **CPD**: `bun run cpd` (PMD copy-paste detector on `index.ts` and `index.test.ts`)
- **Run**: `bun run index.ts`

## Architecture
Entry point: `compileTuffToJS(tuffSource: string): string` in `index.ts`.

Stages (no circular deps: types → tokenizer → parser → validator/generator):
1. **`src/tokenizer.ts`** — `tokenize()` → `Token[]`. Token types: `number`, `boolean`, `op`, `keyword`, `punct`, `eof`. Number literals support integer size suffixes: `U8`, `I8`, `U16`, `I16`, `U32`, `I32`.
2. **`src/parser.ts`** — `Parser` class → `AstNode[]`. Statement types: `decl`, `let`, `assign`, `expr`, `while`, `for`, `break`, `continue`. Expression types (`Expr`): `number`, `boolean`, `identifier`, `binary`, `unary`, `range`, `group`, `assign`, `if`, `match`, `array`, `index`.
3. **`src/validator.ts`** — `validateScopes()` tracks declared vars, mutability, and types (`VarType` = `number` | `boolean` | `range` | `array`). Throws on: undefined vars, assignment to immutable vars, type mismatches, out-of-range integer literals, negation of unsigned values, mismatched if-branches, and use of undeclared variables in expressions.
4. **`src/generator.ts`** — `generateJS()` emits JS. Top-level expressions become `process.exit(Number(...))`. Blocks with declarations wrap in an IIFE. `for` loops expand to `for (let <var>=start; <var><end; <var>++)`. `match` expands to a `switch` over a helper function. `if` becomes a ternary.

Type definitions live in `src/types.ts`.

## Key Conventions
- Tuff programs receive `process` (with `exit(code)`) and `args` (string array) as globals.
- `in let <var>;` declares environment-injected variables; the compiler strips these (they become function parameters at runtime).
- `let` is immutable by default; `let mut` allows reassignment.
- `if` used as an expression requires an `else` branch; both branches must have the same type.
- `for (i in range)` accepts either an inline `start..end` range or an identifier referencing a range variable.
- `match` supports `case <pattern> => <expr>` and `case _ => <expr>` (catch-all).
- Test helper `executeTuff()` in `index.test.ts` prepends `in let args; `, injects `process`/`args` via `new Function()`, and returns the exit code.
- Strict TypeScript: `ESNext` target, `verbatimModuleSyntax`, `noEmit`, `strict`.
- ESLint warns on files over 500 lines (`max-lines` rule) — keep files under this limit.

## File Inventory
- `index.ts` — compiler entry point (`compileTuffToJS`)
- `index.test.ts` — test suite using Bun's `test`/`expect`
- `src/types.ts` — all AST/Token/VarType definitions
- `src/tokenizer.ts` — lexical analysis
- `src/parser.ts` — recursive-descent parser
- `src/validator.ts` — scope/type/int-range checking
- `src/generator.ts` — JS code generation
- `tsconfig.json` — TypeScript config
- `eslint.config.ts` — ESLint config (recommended + max-lines)
- `package.json` — scripts and deps

## Pitfalls
- The parser is greedy on operators; `..` and `=>` are consumed as single tokens.
- Integer suffixes must match the exact length (`U8`/`I8` = 2 chars, `U16`/`I16` = 3 chars, `U32`/`I32` = 4 chars).
- A block `{ let x = ...; x }` used as an expression requires the last statement to be `expr` (an expression), not a declaration.
- `validateScopes` treats `group` expressions as fresh sub-scopes for declarations, so variables declared inside `{}` are not visible outside.
- The `match` target and each `case` pattern/body are validated as full expressions.
