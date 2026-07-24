# Tuff — Compiler Project Guidelines

## Project Overview

Tuff is a compiler that translates `.tuff` source files into TypeScript. The pipeline is **Tokenizer → Parser → Code Generator**, producing output in `src/main/generated-ts/`.

## Build and Test

```bash
bun install          # Install dependencies
bun run start        # Compile src/main/tuff/lib.tuff → src/main/generated-ts/lib.ts
bun run watch        # Watch mode (nodemon: watches src/main/ts and src/main/tuff)
```

Runtime: **Bun** (ESM, TypeScript `ESNext` target, `module: "Preserve"`).

## Architecture

- **`src/main/ts/compile.ts`** — Core compiler: `compileTuffToTS(source)` returns `Result<string, CompileError>`.
- **`src/main/ts/index.ts`** — Entry point: reads `.tuff` source, compiles, writes generated TS.
- **`src/main/tuff/`** — Tuff source files.
- **`src/main/generated-ts/`** — Generated TypeScript output (do not edit manually).

### AST Nodes

Program, LetDeclaration, FunctionDeclaration, FunctionCall, Identifier, MemberExpression, NumberLiteral, StringLiteral, ObjectLiteral, ObjectProperty, BinaryExpression.

### Parsing

Binary expressions use **Pratt-style precedence**: `parseAdditiveExpression` → `parseMultiplicativeExpression` → `parseMemberExpression`. Shared binary parsing via `parseBinaryExpression(ctx, parseLower, operators)`.

### Result Pattern

All operations return `Result<T, X>` (`{ isOk: true, value }` | `{ isOk: false, error }`). **No throws** — errors propagate through the result type.

## Conventions

- ESM only, no CommonJS
- No linter auto-format — match existing manual style
- Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- See repo memory (`/memories/repo/notes.md`) for detailed compiler architecture notes
