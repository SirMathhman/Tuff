# Tuff Compiler — Copilot Instructions

## Project Overview

**Tuff** is a systems programming language prioritizing **safety** with zero-runtime guarantees and SMT-backed verification. This is the **bootstrap compiler** (Phase 1) — written in JavaScript, targets JS/Node.js, and is deliberately minimal but self-compiling.

The bootstrap validates core syntax and semantics before Phase 2 (self-hosted Tuff compiler) and Phase 3+ (LLVM backend with full dependent/linear types).

## Architecture: Compiler Pipeline

The pipeline is orchestrated in [../src/pipeline/compile.js](../src/pipeline/compile.js) as **5 sequential passes**:

```
Source → Lex → Parse → Resolve → Desugar → Emit → JavaScript
```

### 1. **Lexing** (`src/lex/`)

- [../src/lex/lexer.js](../src/lex/lexer.js): Tokenizes source into `{ type, value, span }` objects
- [../src/lex/tokenKinds.js](../src/lex/tokenKinds.js): Keyword set, 1-char and 2-char operators
- Handles comments (`//`, `/* */`), string/char escapes (`\n`, `\"`, `\\`)
- **Location tracking**: Line/column in every token's `span` for precise error reporting

### 2. **Parsing** (`src/parse/`)

- [../src/parse/parser.js](../src/parse/parser.js): Recursive descent parser for statements, declarations (fn, struct, enum, extern use)
- [../src/parse/expr.js](../src/parse/expr.js): **Pratt parsing** for expressions with operator precedence table
- Core precedence (lowest to highest): `||` → `&&` → `==`/`!=`/`is` → comparisons → arithmetic → postfix (`.`, `[]`, `()`)
- **No shadowing enforced at parse time**: handled later in resolve phase
- AST created via [../src/ast/nodes.js](../src/ast/nodes.js) factory: `node(type, {...fields})`

### 3. **Semantic Analysis** (`src/sem/resolve.js`)

- **Two passes**: First declares all struct/enum/fn symbols globally; second resolves references
- **Scope management**: [../src/sem/scope.js](../src/sem/scope.js) prevents shadowing (non-local lookup required)
- **Checks**:
  - Identifier resolution (undefined variable errors)
  - Match exhaustiveness for enums; wildcard required for non-enum
  - Boolean type narrowing in `if`/`while` conditions
  - `break`/`continue` only in loops
  - Mutable field assignment (requires both variable and field mutable)
- **Error collection**: All errors batched and reported together

### 4. **Lowering** (`src/lower/desugar.js`)

- **Currently a no-op** — placeholder for future syntactic sugar expansion

### 5. **Code Generation** (`src/codegen/emitter.js`)

- Walks AST and emits JavaScript with **helper runtime functions**:
  - `__tuff_call(obj, name, ext, args)` — method dispatch (member-first, fallback to extension)
  - `__tuff_is(value, enumName, variant)` — enum variant check
- **Output structure**:
  - Prelude with helper functions
  - Struct constructors (factory functions)
  - Enum definitions (frozen objects with `__enum` and `__tag`)
  - Top-level functions
  - Statements

## Key Patterns & Implementation Details

### Naming & Conventions

- **Files**: `camelCase.js` in category folders
- **Modules**: CommonJS (`require`, `module.exports`)
- **All modules**: `"use strict"` mode

### AST Node Shape

Every node: `{ type: "NodeName", ...fields, span?: { filePath, startLine, startCol, endLine, endCol } }`

Example (from [../src/parse/expr.js](../src/parse/expr.js)):

```javascript
node("BinaryExpr", { op: "+", left, right, span: parser.spanFrom(left, right) })
node("DotCall", { object, property, args, span: ... })
```

### Enum & Struct Codegen

**Enums** (from [../src/codegen/emitter.js](../src/codegen/emitter.js) `emitDecl`):

```javascript
// Input: enum Color { Red, Green }
// Output:
const Color = Object.freeze({
  Red: Object.freeze({ __enum: "Color", __tag: "Red" }),
  Green: Object.freeze({ __enum: "Color", __tag: "Green" }),
});
```

**Structs**: Generated as factory functions with positional parameters.

### Pattern Matching & Match Expressions

- **Enum patterns** → `switch` statement on `__tag`
- **Other patterns** (literals, \_) → `if`-chain
- **Exhaustiveness**: Required for enums; wildcard `_` required for non-enum matches

### Method Call Desugaring

Both syntaxes valid; handled via `__tuff_call`:

- Input: `obj.method(arg)` or `method(obj, arg)`
- Emitted: `__tuff_call(obj, "method", method, [arg])`

## Development Workflows

### Building

```bash
node src/cli.js input.tuff -o output.js      # Compile
npm run compile                                # Run compiler
npm run lint                                   # ESLint check
npm run help                                   # Show CLI options
```

### CLI Flags (from [../src/cli.js](../src/cli.js))

- `--ast` — Print parsed AST as JSON
- `--tokens` — Print lexical tokens as JSON
- `-o, --out <file>` — Output file (default: replace `.tuff` with `.js`)

### Testing Compilation

Use `--tokens` or `--ast` flags to debug specific stages:

```bash
node src/cli.js example.tuff --tokens > tokens.json
node src/cli.js example.tuff --ast > ast.json
```

## Critical Rules & Constraints

### No Shadowing

If a name is declared in any parent scope, you **cannot redeclare** it. This is enforced in [../src/sem/resolve.js](../src/sem/resolve.js) via `Scope.declare()` which checks both local and parent lookups.

### Boolean Conditions

`if`/`while` conditions **must** be boolean expressions. `isBooleanExpr()` in [../src/sem/resolve.js](../src/sem/resolve.js) checks:

- Boolean literals (`true`, `false`)
- Comparison operators (`==`, `!=`, `<`, `>`, etc.)
- Logical operators (`&&`, `||`)
- Unary `!`
- `is` expressions (enum checks)

### Match Exhaustiveness

For enum matching:

- If any case is an enum pattern, **all variants must be covered** or `_` wildcard present
- For non-enum matches, `_` is **required**

### Assignment Targets

Only valid lvalues:

- Identifiers (must be `let mut`)
- Member expressions (requires both variable and field mutable)
- Index expressions to arrays

## Common Implementation Tasks

### Adding a New Operator

1. Add to `PRECEDENCE` object in [../src/parse/expr.js](../src/parse/expr.js)
2. Add token type to `TWO_CHAR` or `ONE_CHAR` in [../src/lex/tokenKinds.js](../src/lex/tokenKinds.js)
3. Handle in `emitExpr()` switch in [../src/codegen/emitter.js](../src/codegen/emitter.js)
4. Add any resolve checks if needed in [../src/sem/resolve.js](../src/sem/resolve.js)

### Adding a New Statement Type

1. Extend parser in [../src/parse/parser.js](../src/parse/parser.js) (`parseStatement()` or `parseTopLevelItem()`)
2. Create AST node via `node()` factory with unique `type`
3. Add resolve logic in `resolveStmt()` in [../src/sem/resolve.js](../src/sem/resolve.js)
4. Add emit logic in `emitStmt()` in [../src/codegen/emitter.js](../src/codegen/emitter.js)

### Debugging Scope Issues

Use this pattern in [../src/sem/resolve.js](../src/sem/resolve.js):

```javascript
const info = ctx.scope.lookup(name);
if (!info) ctx.errors.push(`Undefined: ${name}`);
```

The `Scope` class walks parent chain automatically; no need for manual scope traversal.

## Error Handling Pattern

Errors are **collected, not thrown immediately**:

```javascript
// In resolve.js
if (!ctx.scope.lookup(name)) {
  ctx.errors.push(`Undefined identifier: ${name}`);
}
// ... more checks ...
if (ctx.errors.length) {
  throw new Error(ctx.errors.join("\n"));
}
```

This batches all errors for a single compile run, improving UX.

## File Organization Reference

| Directory       | Purpose                          |
| --------------- | -------------------------------- |
| `src/lex/`      | Tokenization                     |
| `src/parse/`    | Parsing statements + expressions |
| `src/ast/`      | AST node factory                 |
| `src/sem/`      | Semantic analysis + scoping      |
| `src/lower/`    | Desugaring (placeholder)         |
| `src/codegen/`  | JavaScript code emission         |
| `src/pipeline/` | Compiler orchestration           |

## Links to Key Language Features in Specification

Refer to [../SPECIFICATION.md](../SPECIFICATION.md) section **8b) Bootstrap EBNF** for:

- Full grammar (currently implemented)
- Detailed semantics of control flow, pattern matching, struct/enum syntax
- See [../src/parse/expr.js](../src/parse/expr.js) for operator precedence table (PRECEDENCE object)

---

**See also:** `.github/copilot-instructions.md` for cross-file architecture questions; [../SPECIFICATION.md](../SPECIFICATION.md) sections 1–7 for language design rationale and future phases.
