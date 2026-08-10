# Plan: Split `index.ts`

## Current State
`index.ts` is ~1002 lines (warning at 500). Four distinct compiler stages share one file.

## Proposed Structure

```
src/
  types.ts        — Token, AstNode, Expr, VarType
  tokenizer.ts    — tokenize()
  parser.ts       — Parser class
  validator.ts    — validateScopes(), validateU8(), helper validators
  generator.ts    — generateJS(), genExpr(), genNode()
index.ts          — compileTuffToJS() entry + re-exports
```

## Migration Steps

1. **Extract `src/types.ts`** — Move `Token`, `AstNode`, `Expr`, `VarType`. No logic, just type definitions.
2. **Extract `src/tokenizer.ts`** — Move `tokenize()` + import `Token` from types.
3. **Extract `src/parser.ts`** — Move `Parser` class + import `Token`, `AstNode`, `Expr`.
4. **Extract `src/generator.ts`** — Move `generateJS`, `genExpr`, `genNode`, `genBlockJS`, `genComparisonOp`, `genRangeStart`, `genRangeEnd`.
5. **Extract `src/validator.ts`** — Move `validateScopes`, `validateU8`, `validateNodeScope`, `inferExprType`, helpers.
6. **Update `index.ts`** — Keep only `compileTuffToJS()` which imports and chains the four stages.
7. **Update `index.test.ts`** — Import path changes from `"."` to `"./index"` (no behavior change).

## Notes
- Each file stays well under 200 lines
- No circular dependencies: types → tokenizer → parser → validator/generator
- Tests and build commands unchanged
- `tsconfig.json` may need `rootDir` adjustment if needed
