# LHS (Left-Hand Side) Abstraction Plan

## Problem

Currently there are **six separate assignment AST nodes**, each with duplicated evaluation logic:

| Node | Syntax | Lines in evaluator |
|---|---|---|
| `Assign` | `x = v` | 3 |
| `CompoundAssign` | `x += v` | 9 |
| `DerefAssign` | `*r = v` | 13 |
| `ArrayIndexAssign` | `arr[i] = v` | 22 |
| `DerefArrayIndexAssign` | `(*r)[i] = v` | 10 |
| `StructFieldAssign` | `obj.f = v` | 6 |

Each one re-implements "resolve target → write value" in slightly different ways. Adding a new assignment target (e.g. `obj.f = v` through a ref, or `arr[i].field = v`) requires a brand new AST node + parser branch + evaluator case.

## Proposal

Introduce an `Lhs` type that represents "something assignable":

```typescript
export type Lhs =
  | { kind: "var"; name: string }           // x
  | { kind: "deref"; ref: Lhs }             // *r
  | { kind: "index"; array: Lhs; index: AstNode }  // arr[i]
  | { kind: "field"; struct: Lhs; field: string }; // obj.f
```

Replace the six assignment nodes with two:

```typescript
export interface Assign {
  type: "assign";
  lhs: Lhs;
  value: AstNode;
}

export interface CompoundAssign {
  type: "compoundassign";
  lhs: Lhs;
  op: "+" | "-";
  value: AstNode;
}
```

## Benefits

1. **One evaluator function** — `resolveLhs(lhs: Lhs, env: Environment): Value` replaces six case branches
2. **Composability** — `(*ref)[i].x = v` works by construction, no new node needed
3. **Mutability checks** — single place to verify the target is mutable
4. **Reduced AST surface** — 6 nodes → 2 nodes + 1 Lhs type

## Implementation Phases

### Phase 1: Add Lhs type to AST
- Add `Lhs` discriminated union to `src/ast.ts`
- Keep existing assignment nodes (backward compatible)

### Phase 2: Parser — produce Lhs
- Refactor `parseStatement` to detect assignment targets and build `Lhs` trees
- Replace `parseAssign`, `parseDerefAssign`, `parseArrayIndexOrAssign`, `parseDerefArrayIndexAssign`, `parseStructFieldAssign`, `parseCompoundAssign` with unified LHS parsing
- The key insight: parse an expression, then check if next token is `=` or `+=`/`-=`; if the expression is an assignable pattern, convert it to `Lhs`

### Phase 3: Evaluator — resolve Lhs
- Create `resolveLhs(lhs: Lhs, env: Environment): Value` — recursively resolves to the target Value
- Create `writeLhs(lhs: Lhs, env: Environment, value: Value): void` — writes to the target
- Replace six `case` branches with two: `assign` and `compoundassign`

### Phase 4: Type checker
- Add Lhs validation to `checkNode` — verify target is mutable
- Remove six assignment-related checks

### Phase 5: Cleanup
- Remove old assignment AST nodes from `AstNode` union
- Remove duplicate interfaces

## Risks

- **Parser complexity**: detecting LHS vs expression requires lookahead; current code uses `findCloseBracketAndCheckAssign` for arrays — this pattern needs to generalize
- **Nested refs**: `(*ref)[i]` currently works because `DerefArrayIndexAssign` is a flat node; with LHS it becomes `{ kind: "index", array: { kind: "deref", ref: { kind: "var" } } }` which is correct but changes error messages
- **Test coverage**: need to verify all 89 tests still pass after refactor

## Score: 7/10

High value — eliminates real duplication and enables future features (chained assignment, compound struct field assignment) without new AST nodes. Moderate risk due to parser restructuring.
