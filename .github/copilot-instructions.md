```instructions
# AI Coding Agent Instructions for Tuff

## Big Picture
- Interpreter for a small typed language; entry is src/utils/interpret.ts delegating to interpretWithScope in src/app.ts. The dispatcher runs in order: type/struct/fn declarations → var decl → match/loop/while/for → assignments → fn calls → binary ops.
- All runtime values are numbers; maps carry metadata: scope (value), typeMap (size markers), mutMap (mutability), functionDefs, and uninitialized tracking sets.

## Type System & Sentinels
- Primitive sizes via extractTypeSize in src/type-utils.ts (Bool=1, Ix/ Ux sizes). No nulls; use undefined.
- Special markers in typeMap: -2 function types (signature strings kept in typeStr), -3 parsed array type annotation, -4 array variable created from literal/type info.
- Aliases stored as __alias__*, unions as __union__* (CSV of member sizes). Pointers encoded as negative of base type size (e.g., *I32 → -32) and resolved via pointer maps.

## Arrays & Pointers
- Arrays are global IDs >= 2_000_000 stored in src/utils/array.ts with metadata {type, initialized, capacity, values}. Typed arrays use syntax [T; init; cap]; untyped literals use createArrayFromLiteral with elementType 0.
- Field access on arrays supports .length and .init (initialized count). Indexing and field access accept array IDs or pointers to arrays; operators resolve pointer targets using scope (src/expressions/operators.ts + binary-operation.ts).

## Functions & Lambdas
- Functions defined in src/functions.ts; anonymous functions registered through src/handlers/anonymous-functions.ts and referenced via setFunctionRef. Lambdas are detected in function-type annotations and in parseFunctionCall when param type is -2.
- Function types are strings like `(I32, I32) => I32`; use splitParametersRespectingParens in src/utils/function-utils.ts.

## Variable Handling
- handleVarDecl in src/scope.ts parses declarations (supports typed arrays and function types). Array literals are validated against init count; createArray used for typed arrays. Uninitialized vars tracked in two sets; mutability stored in mutMap.
- Pointers: created via &var (handleReferenceOperation in src/handlers/pointer-operations.ts); deref via *ptr in handlers/dereference-assignment.ts and expressions/operators for read access.

## Control Flow & Expressions
- Expression plumbing lives in src/expressions/*.ts; grouped-expressions.ts folds parens/braces before binary-operation dispatch. match.ts and loops/{loop,while,for}.ts handle control constructs.
- parseTypedNumber in src/parser.ts is the fallback when no operators are found.

## Quality Gates & Limits
- Max 8 .ts files per directory; tighter caps: src/expressions (4), src/loops (4), src/handlers (2), src/types (2), src/utils (3). Max 200 lines per file (skip comments/blank).
- ESLint forbids RegExp usage and null; enforce no unused vars (prefix _). Circulars checked via npm run check:circular; duplication via npm run cpd.

## Commands & Workflow
- Fast loop: npm test (bun) → npm run lint → npm run cpd → npm run check:structure → npm run check:circular. Pre-commit hook runs these plus prettier, tsc, check-subdir-deps, and visualize (madge → docs/images/graph.svg).
- Targeted tests live in tests/*.test.ts (arithmetic, variables, control-flow, types, functions). Keep new tests focused per feature.

## Hot Spots / Pitfalls
- Remember to pass scope into binary ops when new pointer-aware operations are added.
- Array bounds: getArrayElement enforces index < initialized; setArrayElement grows initialized up to capacity.
- Function type handling is split between scope.ts (declarations) and functions.ts (calls); keep the -2 marker consistent.
- Respect directory/file-count limits when adding helpers; extract to utils/ if a file nears 200 lines.
```
