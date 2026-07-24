# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tuff is a compiler that translates `.tuff` source files into TypeScript. The pipeline is **Tokenizer → Parser → Semantic Analysis → Code Generator**, producing output in `src/main/generated-ts/`.

See `AGENTS.md` for detailed project guidelines and conventions.

## Commands

```bash
bun install              # Install dependencies
bun run start            # Compile src/main/tuff/lib.tuff → src/main/generated-ts/lib.ts
bun run test             # Run all tests with coverage (Bun test framework)
bun run test -- file.ts  # Run a single test file
bun run watch            # Watch mode (nodemon: watches src/main/ts and src/main/tuff)
bun run lint             # Format (Prettier) + type-check (tsc) + lint+fix (ESLint)
bun run format           # Prettier only
bun run cpd              # PMD copy-paste detection (duplication check)
bun run circular         # Madge circular dependency detection
bun run visualize        # Generate dependency graph → docs/graph.svg
```

Runtime: **Bun** (ESM, TypeScript `ESNext` target, `module: "Preserve"`).

## Architecture

### 4-Stage Pipeline

```
Source (.tuff) → tokenize() → parse() → analyzeSemantics() → generateCode() → Output (.ts)
```

Each stage returns `Result<T, CompileError>` and short-circuits on first error. **No throws** — errors propagate through the result type.

### Key Files

| File | Role |
|---|---|
| `src/main/ts/compile.ts` | Pipeline orchestration — `compileTuffToTS(source)` chains all 4 stages |
| `src/main/ts/index.ts` | Entry point: reads `.tuff` source, compiles, writes generated TS |
| `src/main/ts/tokenize.ts` | Single-pass lexer with type suffix support (`42U8`) |
| `src/main/ts/parse-helpers.ts` | Parser utilities: `peekToken()`, `consumeToken()`, `expectToken()` |
| `src/main/ts/parse-expressions.ts` | Expression parsing: literals, identifiers, struct instances, member chains, `is` operator |
| `src/main/ts/parse-statements.ts` | Statement parsing: `let`, struct definitions, type aliases, assignments |
| `src/main/ts/semantic.ts` | Type checking, scope validation, mutability enforcement |
| `src/main/ts/semantic-generics.ts` | Generic type support: `parseGenericTypeName()`, `inferTypeArgs()`, `resolveAlias()` |
| `src/main/ts/semantic-errors.ts` | 12 specialized error factory functions |
| `src/main/ts/generate.ts` | Code generation with shadowing-aware name resolution (`_N` suffixes) |
| `src/main/ts/types.ts` | All type definitions: `Result`, `CompileError`, AST nodes, tokens |
| `src/main/tuff/` | Tuff source files |
| `src/main/generated-ts/` | Generated TypeScript output (do not edit manually, ESLint-ignored) |

### AST Nodes

**Statements:** `LetDeclaration`, `Assignment`, `StructDefinition`, `MemberAssignment`, `TypeAlias`, `Identifier`, `NumberLiteral`
**Expressions:** `NumberLiteral`, `BooleanLiteral`, `Identifier`, `StructInstance`, `MemberExpression`, `IsExpression`

### Parsing

Parser advances `pos` forward only — **no backtracking**. Generic type syntax uses `<` and `>` characters (tokenized as `LBRACKET`/`RBRACKET`).

### Semantic Analysis

- **Valid types:** `U8`, `U16`, `U32`, `U64`, `I8`, `I16`, `I32`, `I64`, `Bool` + user-defined structs
- **Scope tracking:** `VarEntry[]` with `{ name, mutable, typeName }`
- **Struct tracking:** `StructDef[]` with `{ name, typeParams, fields }`
- **Type aliases:** `TypeAliasDef[]` with `{ name, typeParams, underlyingType }`
- **Shadowing:** Redeclaring a variable creates `_N` suffixed unique names in generated code

### Tuff Language Features

- `let x = 42;` — Variable declaration (immutable by default)
- `let mut x = 42;` — Mutable variable
- `let x : U8 = 42U8;` — Typed declaration with literal suffix
- `struct Point { x : I32, y : I32 }` — Struct definition (semicolon optional)
- `struct Point<T> { x : T, y : T }` — Generic struct
- `type MyInt = I32;` — Type alias
- `type IntPair = Pair<I32, I32>;` — Generic type alias
- `Point { x: 1I32, y: 2I32 }` — Struct instantiation
- `p.x = 42I32;` — Member assignment (requires `mut`)
- `x is Point` — Type check expression (returns Bool)
- `true`, `false` — Boolean literals (require `: Bool` annotation)

### Result Pattern

All operations return `Result<T, X>` (`{ isOk: true, value }` | `{ isOk: false, error }`).

### Error Shape

```ts
interface CompileError {
  message: string;   // Human-readable error
  reason: string;    // Why it happened
  suggestedFix: string; // How to fix it
  line: number;
  column: number;
}
```

## Testing

Tests use **Bun's built-in test framework** (`bun:test`). All test files live in `src/test/ts/`.

Test helpers shared across test files:
- `expectValid(source, args, expectedExitCode)` — Compiles source, transpiles to JS, executes, and asserts exit code
- `expectInvalid(source)` — Asserts compilation fails

Tests wrap generated code in a mock `process.exit()` harness to capture exit codes. Use `Bun.Transpiler` to transpile generated TS to JS before execution.

Run a single test file: `bun run test -- src/test/ts/compile.test.ts`

## Conventions

- ESM only, no CommonJS
- **No template literals** — ESLint forbids `TemplateLiteral`, use `+` concatenation
- No linter auto-format — match existing manual style (Prettier handles formatting)
- Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- ESLint limits: cyclomatic complexity ≤ 10, max file lines ≤ 500 (excluding comments/blanks), max function lines ≤ 50
- Generated code (`src/main/generated-ts/`) is ESLint-ignored
- Commit messages use conventional commits: `feat:`, `fix:`, `refactor:`, etc.

## Pitfalls

- **Token column tracking:** Tokenizer sets `token.column` post-consumption (points to character _after_ the token)
- **Type suffix matching:** Both variable annotation and literal suffix must match (`let x : U8 = 100U8`)
- **Generic structs:** Require explicit type annotation (`let p : Point<I32> = Point<I32> { ... }`)
- **Struct definitions:** Silently skipped during code gen — they only exist at compile time
- **Assignment ambiguity:** `parseAssignmentStatement()` parses an expression first, then checks for `=`
- **Generic syntax:** Uses `<` / `>` characters tokenized as `LBRACKET` / `RBRACKET` (not `LT` / `GT`)
- **Bool literals:** Require `: Bool` type annotation; cannot be inferred
- **`is` operator:** Returns `Bool` type; generated as `typeof x === 'object' && x !== null`

## Pre-commit Hooks

The `.github/hooks/hooks.json` Stop hook runs: tests → CPD (duplication) → lint → circular dependency check → visualize. All must pass before commits.
