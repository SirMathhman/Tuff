# Tuff Compiler

This directory contains the **self-hosting Tuff compiler** — written in Tuff and capable of compiling itself. The compiler implements a traditional multi-stage compilation pipeline: **Lexing → Parsing → Analysis → Emission**.

## Compilation Pipeline

```
Source (.tuff)
    ↓
Lexing (util/lexing.tuff)
    ↓ [Tokens]
Parsing (parsing/*.tuff)
    ↓ [AST]
Analysis (analyzer/*.tuff)
    ↓ [Checked AST + Diagnostics]
Emission (emit/*.tuff)
    ↓
JavaScript (ESM)
```

## Module Organization

### Core Compiler Modules

| Module                                              | Purpose                                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ast.tuff`**                                      | Canonical AST definitions: expression-based tree with type aliases (`Expr`, `Stmt`, `Decl`, `BinOp`) and helper constructors. Central data structure for all stages. |
| **`util/lexing.tuff`**                              | Tokenization: splits source into tokens. Exports `is_digit()`, `is_ident_start()`, `skip_ws()`, and main tokenizer.                                                  |
| **`util/diagnostics.tuff`**                         | Error/warning collection and formatting (file, line, column, caret display). Used by all stages.                                                                     |
| **`parsing/primitives.tuff`**                       | Low-level parsing infrastructure: token stream management, position tracking, panic/error recovery.                                                                  |
| **`parsing/types.tuff`**                            | Type expression parsing: handles `I32`, `String`, function types, generic applications, etc.                                                                         |
| **`parsing/expr_stmt.tuff`** (+ `expr_stmt_*.tuff`) | Expression and statement parsing; main entry point `parse_expr()`, `parse_main_body()`. Handles operator precedence, control flow, lambdas.                          |
| **`parsing/decls.tuff`**                            | Declaration parsing: functions, structs, imports. Orchestrates parsing of top-level items.                                                                           |
| **`analyzer/*.tuff`** (15 submodules)               | Type-checking, scope analysis, name resolution, const folding, narrowing. See `analyzer/README.md`.                                                                  |
| **`emit/ast_js.tuff`**                              | AST → JavaScript emitter: generates ES Module code. Handles expression lowering, function codegen, export scanning.                                                  |
| **`compile/*.tuff`**                                | Multi-file compilation support: export scanning, project-wide analysis, incremental compilation.                                                                     |
| **`refactor/*.tuff`**                               | Refactoring utilities and code generation helpers.                                                                                                                   |
| **`lsp.tuff`**                                      | Language Server Protocol implementation for IDE support.                                                                                                             |
| **`compiler_api.tuff`**                             | Public API for programmatic compilation (used by tools, LSP, tests).                                                                                                 |
| **`build_config.tuff`**                             | Build configuration and phase selection.                                                                                                                             |

### Entry Points

- **`tuffc.tuff`** — Main CLI entry point. Parses command-line arguments, orchestrates compilation, outputs diagnostics.
- **`tuffc_lib.tuff`** — Compiler facade: orchestrates the full pipeline (lex → parse → analyze → emit).
- **`fluff.tuff`** — Linter CLI: parse + analyze without emission.

## Key Data Structures

### Span

Represents source location as a half-open interval `(startOffset, endOffset)`. Stored as tagged union:

```tuff
type Span = SpanVal<(I32, I32)>;
```

### AST (Expression-Based)

Blocks are expressions; functions are first-class values.

- **`Expr`** — recursive expressions (literals, binary ops, calls, if/else, blocks, match, etc.)
- **`Stmt`** — statements (variable binding, return, assignments)
- **`Decl`** — top-level declarations (functions, structs, imports)
- **`BinOp`** — binary operators (Add, Sub, Mul, Div, Eq, Ne, Lt, Le, Gt, Ge, And, Or)
- **`TypeRef`** — type expressions (names, tuples, function types, generic applications)

### Tokens

Token stream with position tracking. Each token carries:

- **`kind`** — token type (Identifier, Number, String, Keyword, Operator, etc.)
- **`text`** — source text (identifier name, literal value)
- **`span`** — source location

### Diagnostics

Error/warning collection with formatting:

```tuff
struct Diagnostic {
  file: String,
  line: I32,
  column: I32,
  message: String,
  caret: String
}
```

## Bootstrap Strategy

The compiler uses **prebuilt artifacts** to enable self-hosting without requiring a prior Tuff compiler:

1. **`selfhost/prebuilt/`** — Pre-compiled `.mjs` modules for all compiler source files
2. **`tools/build_prebuilt_selfhost.ts`** — TypeScript script that:
   - Reads `.tuff` compiler source
   - Uses the current prebuilt compiler to compile itself (Stage 2)
   - Copies all emitted `.mjs` modules to `selfhost/prebuilt/`

After any compiler source modification, regenerate prebuilt:

```bash
npm run build:selfhost-prebuilt
```

**Important**: All compiler modules must be copied to `selfhost/prebuilt/`, not just `tuffc.mjs` and `tuffc_lib.mjs`, because runtime ESM imports (e.g., `./diagnostics.mjs`) depend on their presence.

## Adding a Language Feature

1. **Update Lexer** if new tokens needed (`util/lexing.tuff`)
2. **Extend Parser** (`parsing/expr_stmt.tuff`, `parsing/decls.tuff`, or `parsing/types.tuff`)
3. **Add Analyzer Rules** for type-checking and validation (`analyzer/*.tuff`)
4. **Implement Emitter** to generate JavaScript (`emit/ast_js.tuff`)
5. **Write Tests** (`.tuff` test files or TypeScript tests)
6. **Update Language Spec** (`LANGUAGE.md` in repository root)

## Testing

- **TypeScript tests** (`src/test/ts/*.test.ts`) — validate compiler stages (parsing, analysis, emission)
- **Tuff tests** (`src/test/tuff/*.test.tuff`) — test language features using the self-hosting compiler

Run all tests:

```bash
npm test
```

Regenerate prebuilt and validate bootstrap:

```bash
npm run check:bootstrap
```

## Module Dependencies

```
tuffc.tuff
  └── tuffc_lib.tuff
      ├── parsing/decls.tuff
      │   ├── parsing/expr_stmt.tuff
      │   │   ├── parsing/types.tuff
      │   │   │   └── parsing/primitives.tuff
      │   │   └── util/diagnostics.tuff
      │   └── parsing/primitives.tuff
      ├── analyzer/*.tuff (15 modules)
      │   └── emit/ast_js.tuff
      └── emit/ast_js.tuff

compiler_api.tuff → orchestrates compilation for programmatic use
fluff.tuff → parse + analyze only (linting)
lsp.tuff → compiler + incremental compilation for IDE support
```

## Constants and Configuration

- See `build_config.tuff` for phase selection and feature flags
- Default phase: Phase 4 (full analysis + emission)
- Lint-only mode: phases 1-3 (lex + parse + analyze, no emit)
