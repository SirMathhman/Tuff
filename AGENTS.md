# Tuff Language Interpreter

A test-driven interpreter for the Tuff programming language, built with TypeScript and Bun.

## Quick Start

```bash
bun install
bun test        # Run all tests (with 90% line coverage threshold)
bun run index.ts  # Run interpreter
```

## Workflow

All features follow this test-driven workflow:

1. Add test case to `test/index.test.ts`
2. Run `bun test` — confirm it fails
3. Implement the feature
4. Add logging if needed, iterate until passing
5. Remove debug logging
6. Refactor to comply with hooks (prettier → tsc → eslint → pmd cpd)
7. Suggest architecture improvements

## Hooks

Two hook systems coexist:
- **`.husky/pre-commit`**: Runs `bun run format` (Prettier only) on git commit.
- **`.github/hooks/hooks.json`**: AI agent "Stop" hook runs the full pipeline: `test` → `lint` → `cpd`. This is the validation gate for agent sessions.

## Architecture

### Core Pipeline

`interpret(source)` → tokenize → parse → analyze → evaluate → coerce to number

### Source Files (`src/`)

- `index.ts` — Entry point: `interpret(source)` → tokenize → parse → analyze → evaluate → coerce to number
- `tokenizer.ts` — Lexer with keyword/operator/group/identifier/punctuator tokens. `&` operator with `&&` disambiguation. All tokens carry `pos: TokenPos`.
- `ast.ts` — `AstNode` discriminated union: number, boolean, binary, unary (`-`, `&`, `&mut`, `*`), identifier, let, assign, augassign, block, if, loop, break, while, typecheck, fn, call, array, index, struct, struct_instantiation, field_access, match
- `parser.ts` — `Parser` class with table-driven precedence chain (`parseBinary` iterates `PRECEDENCE` table from `grammar.ts`). Postfix `is` and `[index]` handled in `parseUnary`. `tryParseAssign` uses backtracking for `*expr` lookahead.
- `analyzer.ts` — Single-pass `resolveType()`: bottom-up type resolution, context propagation, symbol table, compatibility validation. All type reasoning lives here (no runtime type checks in evaluator).
- `evaluator.ts` — `evaluate(node, env)` returns `EvalResult`. Reads pre-computed `node.type` from AST — no type reasoning at runtime.
- `value.ts` — `Value` discriminated union (number, boolean, pointer, array). `EvalResult` type, `evalOk()`, `evalBreak()`, `unwrap()`, `toNumber()`.
- `types.ts` — `Type` discriminated union (`NumericType`, `BoolType`, `VoidType`, `DynamicType`, `PointerType`, `ArrayType`). `isAssignable()`, `widen()`, `parseTypeName()`, `typeName()`.
- `grammar.ts` — `PRECEDENCE` table (5 levels), `BinaryOp` derived type, `OPENING` braces, `TYPE_SUFFIXES`, `OPERATORS` category map.
- `error.ts` — `InterpreterError` class with `kind: "parse" | "type" | "runtime"` and optional `position`.

### Key Conventions

- **Table-driven parser**: All binary operators defined in `PRECEDENCE` table in `grammar.ts`. `BinaryOp` type derived from table to prevent drift.
- **EvalResult pattern**: Control flow (break) uses explicit result objects, not exceptions. Loop boundary converts break to value.
- **Analyzer-first semantics**: All type reasoning lives in `analyzer.ts`. The evaluator never does type checks — it reads pre-computed `node.type` from the AST.
- **Symbol table**: `Map<string, Declaration>` where `Declaration = { kind: "var" | "fn", type?: Type, mutable?: boolean, params?: {name, type?}[] }`.
- **Parser class**: Encapsulated state (`pos`). Methods: `peek()`, `consume()`, `match()`, `expect()`, `parse()`, `parseTopLevelStatement()`, `parseStatement()`, `tryParseKnownStatement()`, `tryParseAssign()`, `parseLetStatement()`, `parseAtom()`, `parseBinary()`, `parseUnary()`, `parseIfExpression()`, `parseIfStatement()`, `parseWhileStatement()`, `parseLoopExpression()`, `collectBody()`, `parseBlock()`.
- **Block validation**: Expression context rejects blocks ending with declarations (void type). Statement context allows any last statement.
- **Type system**: Analyzer resolves all types onto AST nodes. Un-suffixed numbers stay `dynamic()` until `typecheck` site (I32 default). Context propagation: dynamic operands inherit from concrete siblings in binary ops.
- **Pointers**: `&x` creates a pointer value. `*ptr` dereferences via `env.get(ptr.target)`. `&mut x` creates mutable pointer. Analyzer validates pointer mutability for assignments.
- **Arrays**: `[expr, expr, ...]` literals create array values. `arr[index]` postfix syntax with bounds checking. `[TypeName; N]` type annotation syntax.
- **Functions**: `fn name(params) => body` syntax. Functions stored in separate `functions` map from the environment. Call sites validate argument count at runtime.

### Pre-commit Hooks

Run in order: prettier → tsc --noEmit → eslint → pmd cpd (50-token minimum, ignore identifiers/literals)

### Pitfalls & Gotchas

- **`interpret()` always returns `number`**: Final result coerced via `toNumber(unwrap(...))`. Non-coercible values (pointers, arrays) at top level are runtime errors.
- **`LValue` is recursive**: Index targets can chain (`arr[i][j]`, `*ptr[i]`). Assignment targets nest through `LValue`, not `AstNode`.
- **`UnresolvedType`**: Intermediate type state in `types.ts` — placeholder for type names parsed but not yet validated.
- **Flat `src/` structure**: All source files live flat in `src/` — no subdirectories despite growing feature set.
- **Single test file**: All tests in `test/index.test.ts`. Tests organized in `describe` blocks with flat structure.
- **`tsconfig.json`**: `module: "Preserve"` with `moduleResolution: "bundler"` — Bun-native setup, import paths have no `.ts` extension.
- **Coverage threshold**: 90% line coverage (`bunfig.toml`), not 100%.

## Testing

All tests in `test/index.test.ts` using `bun:test` framework. Pattern:

```typescript
test('interpret("source") => expected', () => {
  expect(interpret("source")).toBe(expected);
});

test('interpret("source") => Error', () => {
  expect(() => interpret("source")).toThrow();
});
```
