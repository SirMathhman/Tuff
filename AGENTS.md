# Tuff — Agent Instructions

A minimalist compiler that transforms a custom DSL into executable JavaScript.

## Quick Start

```bash
pnpm install
npm run test    # Run tests (Bun) — reads index.test.ts
npm run lint    # Lint all JS/TS files with --fix
npm run cpd     # Check for code duplication via PMD
```

**Pre-commit hooks** (`.github/hooks/hooks.json`) run **test → lint → cpd** on `Stop`. All three must pass before commit succeeds.

## Architecture

- **`index.ts`** — Single-file (~3100 lines) TypeScript compiler. Exports `compile(source)` (single-file DSL → JS) and `compileModules(moduleNames, moduleSources)` (multi-module with cross-module references, `out let` exports, module path resolution).
- **`index.test.ts`** — 89 tests using Bun's built-in test runner (`bun:test`). Helpers: `expectValid()`, `expectInvalid()`, `expectValidWithModules()`. Generated code executed via `new Function("stdIn", generated)(stdIn)`.
- **`lib.tuff`** — Example DSL source (the compiler's own helpers). Compiled into `lib.js` by the `run()` function at the bottom of `index.ts`.
- **`lib.js`** — Compiled output of `lib.tuff` (generated, gitignored).
- **[`FEATURES_MISSING.md`](./FEATURES_MISSING.md)** — Roadmap of C-like features not yet implemented.
- **`.claude/settings.local.json`** — Claude permissions: allows `Bash(git *)` and `Bash(bun test *)`.

### Compiler Pipeline

`compile(source)` executes three stages:

1. **Validation** — `validateVarAssignments()` (type compatibility, immutability) → `validateSource()` (character-by-character syntax check).
2. **Transformation** — `transformBlocks()` recursively processes `{ ... }` blocks. Chain: `stripTypeSuffix` → `stripTypedSyntax` → `transformBlocks`. Also `transformThisParamCalls()` and `boxDeclarations()` run before blocks.
3. **Wrapping** — IIFE wrapper if statements present, otherwise bare `return`. Injects `_tokens`, `read()`, `_readBool()`, `_readString()`, `_toInt()` runtime helpers.

**Dual Skip/Transform Pattern:** For each DSL construct, a `skip*` helper (validation) and a corresponding transform (codegen). Called independently in the pipeline.

## DSL Overview

The language is expression-oriented with C-like syntax. Key semantics:

- **Variables:** `let x = expr;` (immutable), `let mut x = expr;` (mutable, supports `+=`/`-=`/`*=`/`/=`). Type annotations: `let x : U8 = ...`. Shadowing allowed.
- **I/O:** `read()` / `read<T>()` consumes tokens from stdin. `read<Bool>()` → `1`/`0`.
- **Control flow:** `if/else` (lowered to ternary or statements), `while`, `for (i in start..end)`, `break`, `continue`, `yield` (early block return), `return`.
- **Functions:** `fn name(params) => expr;` with optional `: ReturnType`. Recursive calls supported.
- **Structs:** `struct Name { field : Type }` with instantiation `Name { field : val }` and field access `s.field`.
- **Types:** `U8`/`U16`/`U32`, `I8`/`I16`/`I32`, `F32`, `Bool`. Narrower→wider OK, wider→narrower invalid. Typed literals: `100U8`.
- **Arrays:** `[a, b, c]` with `arr[0]` indexing and `.length`. Typed: `let arr : [I32; 2] = ...`.
- **References:** `&x` (address-of), `&mut x` / `*y = val` (mutable references with boxing).
- **Expressions:** `true`/`false`, `||`/`&&`, `==` returns `1`/`0` (never JS booleans). String/char literals.
- **Modules:** `compileModules()` handles `out let` exports, `lib.myVar` cross-refs, `lib::sub` nested paths.
- **Externs:** `extern fn`, `extern struct`, `extern let` for FFI.

See [`index.test.ts`](./index.test.ts) for exhaustive usage examples.

### Boxing Mechanism

Variables with `&mut` references are "boxed": `let mut` RHS wrapped in `[value]`. `&mut x` → `x` (the box), `*ref` → `ref[0]`. Managed by `findBoxedVars()`, `boxDeclarations()`, and the module-level `CURRENT_BOXED_VARS` Set.

## Conventions

| Rule | Enforcement |
|------|-------------|
| **No regex literals or `RegExp`** — use string iteration | ESLint `no-restricted-syntax` (error) |
| **No `throw` statements** — use `Result<T, X>` with `Ok()`/`Err()` | ESLint `no-restricted-syntax` (error) |
| **Max nesting depth: 2** | ESLint `max-depth` |
| **ESM modules** (`"type": "module"`) with named exports | `tsconfig.json` |
| **TypeScript 5.6 strict**, `nodenext`, `verbatimModuleSyntax`, `isolatedModules` | `tsconfig.json` |
| **All functions have explicit type annotations** | `tsc --noEmit` |
| **No single-use named functions** (skip recursive/exported) | Custom ESLint rule (warn) |
| **No duplicate call expressions in same scope** | Custom ESLint rule (warn) |
| **`Result<T, X>`** = `{ ok: true; value: T } \| { ok: false; error: X }`. Check `.ok` at each call site. | Convention |

## Gotchas

- **ASI with `return`:** Never emit newline after `return` in generated JS. `prependReturnToLastExpr()` handles this safely.
- **`CURRENT_BOXED_VARS` is module-level global** — set once per `compile()` call. Be cautious with test isolation.
- **Parser queue draining:** EOF loops must drain the queue (`while !eof || queue.length>0`) or trailing lowered declarations are silently dropped.
- **`validateSource` uses character-by-character iteration** — no regex. Token matching via string comparison helpers.
- **Don't think, measure!** — When stuck, add `console.log` statements to trace runtime values rather than reasoning manually. Instrument the pipeline stages.
