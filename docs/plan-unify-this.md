# Plan: Unify `this` Handling

## Goal

Consolidate the three divergent mechanisms for handling `this` into a single, first-class representation. Today `this` is resolved through a mix of:

1. **`ctx.thisType`** on `CheckContext` — the implicit constructor object's struct type (for constructor functions).
2. **A `this` parameter declared in scope** — the receiver binding for methods (e.g. `fn getX(this : Point) => this.x`).
3. **A `thisName` string threaded through codegen** — renames `this` to `__this__` when it's a receiver param, and uses string comparisons (`thisName === "this"`) to decide whether `this.x` is a bare scope reference or a field access.

This split is fragile: the `isConstructor` gate (`!hasThisParam`) and the `thisName === "this"` check in codegen both special-case the same ambiguity, and the checker resolves `this`'s type via `ctx.scope.typeOf("this") ?? ctx.thisType ?? { kind: "this" }` — a three-way fallback. The goal is to resolve `this`'s meaning **once** in the checker and let codegen derive its behavior from that resolved type, eliminating the string-based coupling.

## Current State (verified)

### Checker (`src/checker.ts`)

- **`this` case**: `setNodeType(node, ctx.scope.typeOf("this") ?? ctx.thisType ?? { kind: "this" })`. Three-way fallback:
  - A `this` param declared in scope → its declared type (e.g. `Point` struct type).
  - `ctx.thisType` set (constructor body) → the implicit struct type.
  - Otherwise → the special `ThisType { kind: "this" }` (bare scope reference).
- **`member_access` for `this.x`**: `const thisType = ctx.scope.typeOf("this") ?? ctx.thisType;` then:
  - If `thisType.kind === "struct"` → resolve the field via `resolveStructField`.
  - Else → treat `this.x` as a bare scope reference to variable `x` (checks `ctx.scope.isDeclared(node.property)`).
- **`fn_decl`**: computes `implicitStruct` from the return type; threads it as `ctx.thisType` via `withThis(implicitStruct)`; declares params (including a `this` param) in the child scope with their resolved types.

### Codegen (`src/codegen.ts`)

- **`this` case**: emits `thisName` (default `"this"`).
- **`member_access` for `this.x`**: `if (thisName === "this") return ok(node.property); return ok(thisName + "[\"x\"]");` — string comparison decides bare-variable vs field-access.
- **`fn_decl`**: `hasThisParam = node.params.some((p) => p.name === "this")`; renames `this` → `__this__` and threads `innerThisName`; `isConstructor = !hasThisParam && (body is this / this.field / block ending in this)`.

### Type system (`src/ast.ts`, `src/types.ts`)

- `ThisType { kind: "this" }` is a member of the `Type` union.
- `formatType` renders `"this"`; `isKnownType` returns false; `conversionKind` returns `"impossible"` when either side is `this`; `typeMatches` true only for `this` vs `this`.

### The problem

The meaning of `this` is decided in **two places** (checker via type fallback, codegen via `thisName` string), and they can disagree. The `thisName === "this"` check in codegen is a heuristic: it assumes `thisName` is `"this"` exactly when `this` is a bare scope reference, but `thisName` is really just "the JS identifier to emit for `this`", which is an implementation detail leaking into semantic decisions. The `isConstructor` gate similarly re-derives what the checker already knows (whether `this` is a constructor object).

## Design

Resolve `this`'s meaning **once** in the checker and record it on the AST node, so codegen never has to guess.

### Key decisions

1. **`this` resolves to a concrete type in the checker.** The `this` case already computes the type; the change is to make that resolution authoritative and store it so codegen can read it. Concretely, add a field to `ThisNode` (or reuse the existing `NODE_TYPES` side-table) that records whether `this` is:
   - a **receiver value** (a `this` param with a struct/other type), or
   - a **constructor object** (implicit struct), or
   - a **bare scope reference** (outside any function).

2. **Codegen derives behavior from the resolved type, not string comparisons.** Replace `thisName === "this"` and `!hasThisParam` with a check on the resolved `this` kind. The `thisName` string remains only as a _naming_ concern (renaming `this` → `__this__` for valid JS), never as a _semantic_ signal.

3. **Keep `ThisType` for the bare scope reference.** The bare `this` (outside a function) stays a compile-time-only construct with no runtime value; it is not assignable to any real type. This is unchanged.

4. **Single source of truth for "is this a constructor".** The checker already computes `implicitStruct`; codegen should learn "this function is a constructor" from the resolved `this` type (a struct type that is the implicit constructor object) rather than re-deriving it from the body shape + `hasThisParam`.

## Steps

### Step 1 — Record the resolved `this` meaning in the checker (`src/checker.ts`)

In the `this` case, after computing the type, record a discriminator on the node so codegen can read it. Options:

- **Option A (preferred):** Add a field to `ThisNode` in `src/ast.ts`, e.g. `kind: "this"` plus a `thisRole: "receiver" | "constructor" | "scope"` field, set by the checker.
- **Option B:** Store the resolved type in `NODE_TYPES` (already done) and have codegen read `inferType` — but codegen currently doesn't import `inferType`, and the type alone doesn't distinguish "constructor object" from "receiver struct" (both are `StructType`). So a dedicated role field is clearer.

The role is derived from the same three-way fallback already in the checker:

- `ctx.scope.typeOf("this")` present → `"receiver"`.
- `ctx.thisType` present → `"constructor"`.
- neither → `"scope"`.

### Step 2 — Update codegen `member_access` (`src/codegen.ts`)

Replace the `thisName === "this"` string check with the resolved role:

- `"scope"` → emit bare `node.property` (bare scope reference to variable `x`).
- `"receiver"` → emit `thisName["x"]` (field access on the receiver object).
- `"constructor"` → handled by the constructor path (see Step 3).

### Step 3 — Update codegen `fn_decl` (`src/codegen.ts`)

Replace the `isConstructor = !hasThisParam && (body shape)` heuristic with a check on the resolved `this` role:

- A function is a constructor when its body's `this` resolves to `"constructor"` (i.e. the checker set `ctx.thisType` for it).
- This removes the `!hasThisParam` gate and the body-shape re-derivation, making codegen consistent with the checker.

### Step 4 — Keep `thisName` as a pure naming concern

`thisName` continues to rename `this` → `__this__` for valid JS, but is no longer used to decide semantics. This decouples naming from meaning.

### Step 5 — Verify tests

- All existing tests must still pass, including:
  - `fn addOnce(this : I32) => this + 1; 100.addOnce()` → 101 (receiver, primitive).
  - `struct Point { x : I32, y : I32 } fn getX(this : Point) => this.x; let pt : Point = Point { x : 3, y : 4 }; pt.getX()` → 3 (receiver, struct).
  - `fn Wrapper(field : I32) : Wrapper => this; Wrapper(100).field` → 100 (constructor).
  - `let x = 100; this.x` → 100 (bare scope reference).
- Re-add the previously-removed `fn outer() => { fn inner() => 100; this } outer().inner()` test **only if** the unified model makes its semantics well-defined (see Risks).

### Step 6 — Run hooks

- `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all must pass.

## Risks / Considerations

- **Nested functions**: The removed test `fn outer() => { fn inner() => 100; this } outer().inner()` exposes a genuine ambiguity: `inner` is a nested function with no `this` param, so `outer().inner()` passes the receiver as an argument and fails with "expects 0 arguments, got 1". The unified model makes the _role_ explicit, but does not by itself decide whether a nested function should inherit an outer `this`. Decide explicitly: either (a) nested functions do NOT inherit `this` (current behavior — `inner` has no `this` param, so `outer().inner()` is a type error), or (b) nested functions inherit the enclosing `this` (making the test valid). This is a semantic decision to make before re-adding the test.
- **`ThisNode` field vs side-table**: Adding a field to `ThisNode` keeps the AST a pure data structure (the field is set by the checker, like `IsNode.result`). This is consistent with how `is` stores its compile-time result. Prefer this over a new side-table.
- **`noUncheckedIndexedAccess`**: When reading `node.body.statements[...]`, guard for `undefined` (existing pattern).
- **ESLint restrictions**: No classes, no `throw`, no backticks, no inline object types (use named interfaces), no `Record`, no default `Error`.
- **Behavioral equivalence**: The unified model must produce identical results for all currently-passing tests. The only intended behavioral change is removing the codegen heuristics; the checker's type resolution is already the source of truth.

## Out of Scope

- Adding `impl` blocks or associated-function syntax (methods are still free functions with a `this` param).
- Borrow checking / lifetimes.
- Changing the `ThisType` assignability rules.

## Definition of Done

- `this`'s meaning (receiver / constructor / scope) is resolved once in the checker and recorded on the node.
- Codegen derives `member_access` and `isConstructor` behavior from that resolved role, not from `thisName === "this"` or `!hasThisParam` string/flag heuristics.
- `thisName` is purely a JS-naming concern.
- All existing tests pass; hooks pass.
