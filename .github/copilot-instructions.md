# AI Coding Agent Instructions for Tuff

## Big Picture

Tuff is a **typed expression interpreter** for a small language. Entry point is `interpret()` in [src/utils/interpret.ts](src/utils/interpret.ts), which delegates to `interpretWithScope()` in [src/app.ts](src/app.ts).

**Execution model:** All runtime values are numbers. Metadata is stored in four companion maps:

- `scope`: variable name → numeric value
- `typeMap`: name → type size (positive for primitives/arrays, negative for pointers, special markers for functions)
- `mutMap`: name → mutability boolean
- `uninitializedSet`/`unmutUninitializedSet`: track uninitialized variables

**Dispatch cascade** (in [src/app.ts](src/app.ts), lines ~60–185): type/struct/fn declarations → var decl → match/while/for/loop → if-expr → deref assignment → assignment → direct var lookup → fn calls → reference ops (\*ptr, &var) → lambda → unary ops → module access → grouped expressions (parens/braces) → binary ops.

## Type System & Sentinels

**Primitive types** via `extractTypeSize()` in [src/type-utils.ts](src/type-utils.ts): `Bool` (size 1), `I32`/`I64` (signed), `U8`/`U16`/`U32`/`U64` (unsigned).

**Type markers in typeMap:**

- **Positive:** base type size (e.g., 32 for I32)
- **Negative:** pointer to type (e.g., -32 for `*I32`)
- **-2:** function type; full signature string stored in separate `typeStr` map
- **-3:** parsed array type annotation `[T; init; cap]`
- **-4:** array variable created from literal or type info

**Custom types:** Aliases stored as `__alias__TypeName` (value = size), unions as `__union__UnionName` (value = CSV of member sizes).

## Arrays & Pointers

**Array storage:** Global registry in [src/utils/array.ts](src/utils/array.ts); each array is assigned ID ≥ 2,000,000 with metadata `{type, initialized, capacity, values}`.

**Syntax:** Typed arrays `[I32; 5; 10]` (element type, initialized count, capacity). Untyped literals `[1, 2, 3]` created via `createArrayFromLiteral()` with elementType 0.

**Field access:** `.length` and `.init` (initialized count) on arrays/array pointers. Indexing (`arr[i]`) accepts array IDs or pointers; operators in [src/expressions/operators.ts](src/expressions/operators.ts) + [src/expressions/binary-operation.ts](src/expressions/binary-operation.ts) resolve pointer targets via scope.

## Functions & Lambdas

**Function definitions** in [src/functions.ts](src/functions.ts): stored in `functionDefs` map. Anonymous functions registered via [src/handlers/anonymous-functions.ts](src/handlers/anonymous-functions.ts), referenced with `setFunctionRef()`.

**Function types:** Signature strings like `(I32, I32) => I32`. Parsed via `isFunctionType()` and `splitParametersRespectingParens()` in [src/utils/function-utils.ts](src/utils/function-utils.ts).

**Lambdas:** Detected in function-type annotations; when param type is -2, `parseFunctionCall()` creates lambda. Anonymous function context tracked via `getLastRegisteredLambdaName()` in [src/handlers/lambda-expressions.ts](src/handlers/lambda-expressions.ts).

## Variable Handling

**Declaration:** `handleVarDecl()` in [src/scope.ts](src/scope.ts) parses `let x : Type = value;`. Supports typed arrays and function types. Uninitialized vars tracked in two sets; mutability in `mutMap`.

**Array init validation:** Array literals checked against declared init count; typed arrays use `createArray()` helper.

**Pointers:** Created via `&var` (handleReferenceOperation in [src/handlers/pointer-operations.ts](src/handlers/pointer-operations.ts)); dereferenced via `*ptr` in [src/handlers/dereference-assignment.ts](src/handlers/dereference-assignment.ts) for writes, operators for reads.

## Control Flow & Expressions

**Expression plumbing:** [src/expressions/](src/expressions/) directory; `grouped-expressions.ts` folds parentheses/braces before dispatch. `match.ts` and [src/loops/](src/loops/) handle control constructs (loop, while, for, break).

**Fallback:** `parseTypedNumber()` in [src/parser.ts](src/parser.ts) when no operators found.

**Binary operators:** Implemented in `handleBinaryOperation()` with scope passed for pointer-aware resolution.

## Quality Gates & Limits

- **Max 8 .ts files per directory** (enforced by `npm run check:structure`)
- **Max 200 lines per file** (count code, skip comments/blanks)
- **ESLint rules:** No RegExp, no null, no unused vars (prefix unused with `_`)
- **Circular dependencies:** Checked via `npm run check:circular`
- **Code duplication:** Detected via `npm run cpd` (PMD, min 60 tokens)

## Commands & Workflow

**Fast validation loop:**

```bash
npm test                    # bun test (run all *.test.ts)
npm run lint                # tsc --noEmit + eslint
npm run cpd                 # code duplication check
npm run check:structure     # directory file count limits
npm run check:circular      # circular dependency detection
```

**Pre-commit hook** (via husky) runs above plus `prettier`, `check-subdir-deps`, and `visualize` (madge → [docs/images/graph.svg](docs/images/graph.svg)).

**Tests:** Located in [tests/](tests/); organized by feature (arithmetic, variables, control-flow, types, functions). Keep focused per feature.

## Hot Spots & Pitfalls

- **Scope in binary ops:** Pass scope when adding pointer-aware operations; operators must resolve pointer targets.
- **Array bounds:** `getArrayElement` enforces index < initialized; `setArrayElement` grows initialized up to capacity.
- **Function type marker -2:** Ensure consistency between scope.ts (declarations) and functions.ts (calls).
- **File growth:** Extract helpers to new files or [src/utils/](src/utils/) when approaching 200 lines.
- **Module access patterns:** [src/handlers/module-access.ts](src/handlers/module-access.ts) must resolve and validate module scope before returning values.
