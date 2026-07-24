# Tuff — Compiler Project Guidelines

## Project Overview

Tuff is a compiler that translates `.tuff` source files into TypeScript. The pipeline is **Tokenizer → Parser → Semantic Analysis → Code Generator**, producing output in `src/main/generated-ts/`.

## Build and Test

```bash
bun install          # Install dependencies
bun run start        # Compile src/main/tuff/lib.tuff → src/main/generated-ts/lib.ts
bun run test         # Run tests with coverage
bun run watch        # Watch mode (nodemon: watches src/main/ts and src/main/tuff)
bun run lint         # Format + type-check + lint+fix
bun run circular     # Detect circular dependencies
```

Runtime: **Bun** (ESM, TypeScript `ESNext` target, `module: "Preserve"`).

## Architecture

### 4-Stage Pipeline

```
Source (.tuff) → tokenize() → parse() → analyzeSemantics() → generateCode() → Output (.ts)
```

- **`src/main/ts/compile.ts`** — Pipeline orchestration: `compileTuffToTS(source)` chains all 4 stages. Each stage returns `Result<T, CompileError>` and short-circuits on first error.
- **`src/main/ts/index.ts`** — Entry point: reads `.tuff` source, compiles, writes generated TS.
- **`src/main/ts/tokenize.ts`** — Single-pass lexer with type suffix support (`42U8`).
- **`src/main/ts/parse-helpers.ts`** — Parser utilities: `peekToken()`, `consumeToken()`, `expectToken()`.
- **`src/main/ts/parse-expressions.ts`** — Expression parsing: literals, identifiers, struct instances, member chains, generic type args.
- **`src/main/ts/parse-statements.ts`** — Statement parsing: `let`, struct definitions, assignments, member assignments.
- **`src/main/ts/semantic.ts`** — Type checking, scope validation, mutability enforcement.
- **`src/main/ts/semantic-generics.ts`** — Generic type support: `parseGenericTypeName()`, `inferTypeArgs()`, `resolveFieldTypeWithGenerics()`.
- **`src/main/ts/semantic-errors.ts`** — 12 specialized error factory functions.
- **`src/main/ts/generate.ts`** — Code generation with shadowing-aware name resolution (`_N` suffixes).
- **`src/main/ts/types.ts`** — All type definitions: `Result`, `CompileError`, AST nodes, tokens.
- **`src/main/tuff/`** — Tuff source files.
- **`src/main/generated-ts/`** — Generated TypeScript output (do not edit manually).

### AST Nodes

**Statements:** `LetDeclaration`, `Assignment`, `StructDefinition`, `MemberAssignment`
**Expressions:** `NumberLiteral`, `Identifier`, `StructInstance`, `MemberExpression`

### Parsing

Parser advances `pos` forward only — **no backtracking**. No binary expressions or Pratt parsing in the current codebase. Expressions are: literals, identifiers, struct instances, and member chains.

### Semantic Analysis

- **Valid types:** `U8`, `U16`, `U32`, `U64`, `I8`, `I16`, `I32`, `I64` + user-defined structs
- **Scope tracking:** `VarEntry[]` with `{ name, mutable, typeName }`
- **Struct tracking:** `StructDef[]` with `{ name, typeParams, fields }`
- **Shadowing:** Redeclaring a variable creates `_N` suffixed unique names internally

### Result Pattern

All operations return `Result<T, X>` (`{ isOk: true, value }` | `{ isOk: false, error }`). **No throws** — errors propagate through the result type.

### Error Shape

```ts
interface CompileError {
  message: string; // Human-readable error
  reason: string; // Why it happened
  suggestedFix: string; // How to fix it
  line: number;
  column: number;
}
```

## Conventions

- ESM only, no CommonJS
- **No template literals** — ESLint forbids `TemplateLiteral`, use `+` concatenation
- No linter auto-format — match existing manual style
- Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- ESLint: cyclomatic complexity ≤ 10, max file lines ≤ 500, max function lines ≤ 50
- Generated code (`src/main/generated-ts/`) is ESLint-ignored
- Test helpers: `expectValid(source, expectedExitCode)`, `expectInvalid(source, expectedError)`

## Pitfalls

- **Token column tracking:** Tokenizer sets `token.column` post-consumption (points to character _after_ the token)
- **Type suffix matching:** Both variable annotation and literal suffix must match (`let x : U8 = 100U8`)
- **Generic structs:** Require explicit type annotation (`let p : Point<I32> = Point { ... }`)
- **Struct definitions:** Silently skipped during code gen — they only exist at compile time
- **Assignment ambiguity:** `parseAssignmentStatement()` parses an expression first, then checks for `=`
