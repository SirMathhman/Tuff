# Plan: Centralize Constructor Detection on the Function Signature

## Goal

Make "is this function a constructor" a **single, explicit fact** recorded once on the `FnSignature`, instead of being re-derived from the body shape in two separate places (the checker's `isConstructorBody` and codegen's `isConstructor`). Today the constructor-body detection is a growing list of special-cased body shapes (`this`, `this.field`, block ending in `this`, `this is X`) that must be kept in sync across the checker and codegen.

## Current State (verified)

### Checker `fn_decl` case (`src/checker.ts`)

Computes `isConstructorBody` by special-casing body shapes:

```ts
const isConstructorBody =
  node.body.kind === "this" ||
  (node.body.kind === "member_access" && node.body.object.kind === "this") ||
  (node.body.kind === "is" && node.body.value.kind === "this") ||
  (node.body.kind === "block" &&
    node.body.statements[node.body.statements.length - 1]?.kind === "this");
```

This feeds `implicitStructName` (the constructor's implicit struct name), which is stored on the `FnSignature` as `implicitStructName`.

### Codegen `fn_decl` case (`src/codegen.ts`)

Re-derives whether the function is a constructor by finding the terminal `this` node and checking its `thisRole`:

```ts
let terminalThis: ThisNode | undefined;
if (node.body.kind === "this") {
  terminalThis = node.body;
} else if (
  node.body.kind === "member_access" &&
  node.body.object.kind === "this"
) {
  terminalThis = node.body.object;
} else if (node.body.kind === "block") {
  const last = node.body.statements[node.body.statements.length - 1];
  if (last !== undefined && last.kind === "this") {
    terminalThis = last;
  }
}
const isConstructor = terminalThis?.thisRole === "constructor";
```

### The problem

- The checker's `isConstructorBody` and codegen's `isConstructor` are **two separate implementations** of the same concept, and they can drift apart. For example, the checker recognizes `this is X` as a constructor body, but codegen's `isConstructor` does NOT (it only looks for `this`, `this.field`, or a block ending in `this`). This is a latent inconsistency.
- Every new way to write a constructor body (e.g. `this is X`) requires editing **both** the checker's `isConstructorBody` and codegen's `isConstructor` — a fragile, error-prone pattern.
- The `FnSignature` already stores `implicitStructName` (which is non-undefined exactly when the function is a constructor), but codegen doesn't use it — it re-derives constructor-ness from the body shape instead.

## Design

Record "is this a constructor" as an explicit fact on the `FnSignature`, and have codegen read it directly instead of re-deriving it from the body shape.

### Key decisions

1. **`implicitStructName` is the single source of truth for constructor-ness.** A function is a constructor iff `sig.implicitStructName !== undefined`. This is already computed once in the checker's `fn_decl` case and stored on the signature. Codegen should read it rather than re-derive constructor-ness from the body.

2. **Codegen needs access to the signature.** Currently `generateJS` operates on the AST node and doesn't have the `FnSignature`. The cleanest way to give codegen the constructor fact is to **record it on the `FnDeclNode`** (or a related node) during checking, mirroring how `ThisNode.thisRole` and `IsNode.result` are set by the checker. Concretely, add a field to `FnDeclNode` (e.g. `isConstructor?: boolean` or reuse the resolved `implicitStructName`) that the checker sets once.

3. **Keep the body-shape logic in ONE place (the checker).** The checker's `isConstructorBody` remains the single place that decides "is this a constructor" from the body shape. Codegen stops re-deriving it and instead reads the recorded fact.

4. **`thisRole` stays as-is.** The `ThisNode.thisRole` mechanism (receiver/constructor/scope) is orthogonal and remains for `this`/`this.x` emission. The change is specifically about the _function-level_ constructor fact.

## Steps

### Step 1 — Record the constructor fact on `FnDeclNode` (`src/ast.ts`)

Add a field to `FnDeclNode` that the checker sets once:

```ts
export interface FnDeclNode {
  kind: "fn_decl";
  name: string;
  params: FnParam[];
  returnType: Type;
  body: ASTNode;
  // Whether this function is a constructor (its body is `this`/`this.field`/
  // `this is X`/a block ending in `this`). Set once by the checker; codegen
  // reads it instead of re-deriving it from the body shape.
  isConstructor?: boolean;
}
```

### Step 2 — Set it in the checker's `fn_decl` case (`src/checker.ts`)

After computing `isConstructorBody` (and `implicitStructName`), set `node.isConstructor = implicitStructName !== undefined` (or `isConstructorBody`). This is the single place that decides constructor-ness.

### Step 3 — Update codegen's `fn_decl` case (`src/codegen.ts`)

Replace the `terminalThis`/`thisRole` re-derivation with a direct read of the recorded fact:

```ts
const isConstructor = node.isConstructor === true;
```

This removes the body-shape re-derivation from codegen. The constructor's field-collection and return-emission logic stays the same (it still needs to inspect the body to know what to emit, but no longer to decide _whether_ it's a constructor).

### Step 4 — Verify tests

- All existing tests must still pass, including:
  - `fn Wrapper(field : I32) : Wrapper => this; Wrapper(100).field` → 100 (constructor, `this` body).
  - `fn Wrapper() : Wrapper => { let field = 100; this } Wrapper().field` → 100 (constructor, block body).
  - `fn Counter() => this is Counter; Counter()` → 1 (constructor, `this is X` body).
  - `fn addOnce(this : I32) => this + 1; 100.addOnce()` → 101 (NOT a constructor — has a `this` param).
- Add a regression test if feasible for a constructor with a `this is X` body combined with field access, to prove the checker and codegen agree.

### Step 5 — Run hooks

- `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all must pass.

## Risks / Considerations

- **Codegen still inspects the body for emission**: Even after this change, codegen's constructor path needs to inspect the body to collect field names and decide what to return (the object, a field, or a block's statements). The change only removes the _decision_ of whether it's a constructor, not the _emission_ logic. This is fine — the emission logic is inherently body-shape-dependent.
- **`this is X` body in codegen**: Currently codegen's `isConstructor` does NOT recognize `this is X` as a constructor body (a latent bug). After this change, codegen reads `node.isConstructor`, so a `this is X` constructor will be correctly recognized. Verify the emission path handles an `is` body (it should emit `return <result>;` like a normal expression body).
- **`noUncheckedIndexedAccess`**: When reading `node.body.statements[...]`, guard for `undefined` (existing pattern).
- **ESLint restrictions**: No classes, no `throw`, no backticks, no inline object types (use named interfaces), no `Record`, no default `Error`.
- **Behavioral equivalence**: The only intended change is removing codegen's re-derivation. All currently-passing tests must produce identical results.

## Out of Scope

- Changing how constructors are declared (the `isConstructorBody` body-shape logic stays in the checker).
- Changing `ThisNode.thisRole` or the `this`/`this.x` emission.
- Adding `impl` blocks or associated-function syntax.

## Definition of Done

- `FnDeclNode` has an `isConstructor?: boolean` field set once by the checker.
- Codegen's `fn_decl` case reads `node.isConstructor` instead of re-deriving constructor-ness from the body shape.
- The checker's `isConstructorBody` is the single place that decides constructor-ness from the body.
- All existing tests pass; hooks pass.
