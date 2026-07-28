# Tuff Language Interpreter

A test-driven interpreter for the Tuff programming language, built with TypeScript and Bun.

## Quick Start

```bash
bun install
bun test        # Run all tests
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

## Architecture

### Core Pipeline

`interpret(source)` → tokenize → parse → evaluate → coerce to number

### Source Files (`src/`)

- `index.ts` — Entry point: `interpret(source)` function
- `tokenizer.ts` — Lexer with keyword/operator/group/identifier/punctuator tokens
- `ast.ts` — `AstNode` discriminated union (number, boolean, binary, identifier, let, assign, augassign, block, if, loop, break, while)
- `parser.ts` — `Parser` class with table-driven precedence chain (`parseBinary` iterates `PRECEDENCE` table from `grammar.ts`)
- `evaluator.ts` — `evaluate(node, env)` returns `EvalResult` (`{ kind: "value", value }` | `{ kind: "break", value }`)
- `value.ts` — `Value` discriminated union, `EvalResult` type, `evalOk()`, `evalBreak()`, `unwrap()`, `toNumber()`
- `grammar.ts` — `PRECEDENCE` table (6 levels), `BinaryOp` derived type, `OPENING` braces

### Key Conventions

- **Table-driven parser**: All binary operators defined in `PRECEDENCE` table in `grammar.ts`. `BinaryOp` type derived from table to prevent drift.
- **EvalResult pattern**: Control flow (break) uses explicit result objects, not exceptions. Loop boundary converts break to value.
- **Mutability tracking**: Environment uses `__mutable__${name}` convention. `getMutable()`/`setMutable()` helpers enforce immutability.
- **Parser class**: Encapsulated state (`pos`, `skipBlockCheck`). Methods: `peek()`, `consume()`, `match()`, `expect()`, `parse()`, `parseTopLevelStatement()`, `parseStatement()`, `tryParseKnownStatement()`, `tryParseAssign()`, `parseLetStatement()`, `parseAtom()`, `parseBinary()`, `parseIfExpression()`, `parseIfStatement()`, `parseWhileStatement()`, `parseLoopExpression()`, `collectBlockStatements()`, `parseBlockStmt()`, `parseBlockExpr()`.
- **Block validation**: Statement context (`parseBlockStmt`) allows any last statement. Expression context (`parseBlockExpr`) rejects blocks ending with declarations.

### Pre-commit Hooks

Run in order: prettier → tsc --noEmit → eslint → pmd cpd (50-token minimum, ignore identifiers/literals)

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
