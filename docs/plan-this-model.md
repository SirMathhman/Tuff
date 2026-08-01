# Plan: Full `this` Model (Closures, `this.this` Climbing, Chaining)

## Goal

Implement the complete `this` semantics confirmed with the user, centered on the chaining example:

```
fn Counter() => { let mut counter = 0; fn add() => { counter += 1; this.this } this }
Counter().add().add().add().counter  =>  3
```

This requires two major architectural changes:

1. **Closures over captured variables** — `add` closes over `counter` (a local in `Counter`'s body), so nested functions that capture outer variables must become closures, not top-level hoisted functions.
2. **`this.this` climbing** — `this.this` is a reference to the enclosing function's `this`; `this.this.this` reaches the next level; `this.this.this.this` = the global scope.

## Confirmed Semantics (from user)

1. **Bare `this` outside functions** = the global scope. `this.x` at top level = variable `x` in scope.
2. **`this.this`** = a reference to the enclosing function's `this` (the outer constructor object). `this.this is &Outer` => true. Enables chained append calls.
3. **Methods vs constructors**: A `this` param = method; a body returning `this`/`this.field`/`this is X` with no `this` param = constructor. A nested constructor CAN have a receiver (`&this.this`, `&mut this.this`, `this.this : &mut Outer`).
4. **`this` in nested functions** = the INNERMOST enclosing function's `this`.
5. **Three-level nesting**: `this.this.this` reaches the outermost `this`; `this.this.this.this` = global scope. Each `.this` climbs one level.
6. **Chaining**: `fn add() => { counter += 1; this.this }` returns `&Counter`, so `.add().add().add()` chains on the same object. If `add` returned `this` instead, `?.add() is add` would be true (its own this), not `Counter`.
7. **Hoisting vs closures**: Nested functions become CLOSURES when they capture outer variables; self-contained ones are HOISTED to top level.
8. **`this.this` mutability**: `this.this` is `&Outer` by default (immutable ref). The outer constructor object CAN be mutable (`&mut this.this`).

## Current State (verified)

### Codegen (`src/codegen.ts`)

- `generateJS(node, isRedeclare?, thisName?, hoisted: string[])` threads a `hoisted` buffer.
- Nested `fn_decl`s inside constructor/block bodies are emitted into the `hoisted` buffer (top-level), NOT inline. This is what breaks closures — a hoisted function can't capture `counter` (a local in `Counter`'s body).
- `fn_decl` renames a `this` param to `__this__` and threads `innerThisName`.
- Constructor path emits `function Name(params) { ... return { fields }; }`.

### Checker (`src/checker.ts`)

- `CheckContext` has `thisType` and `outerThisType` (added recently). `withThis(newThisType)` sets `outerThisType = thisType`.
- `member_access` special-cases `this.this` → `{ kind: "ref", inner: outerThisType, isMut: false }`.
- `isConstructorBody` recognizes `this`/`this.field`/`this is X`/block-ending-in-`this`/block-ending-in-`this is X` bodies, requiring `!hasThisParam`.
- `FnDeclNode.isConstructor` records constructor-ness.

### `index.ts`

- Passes a shared `hoisted: string[]` buffer to each top-level `generateJS` call and emits `hoisted.join(" ")` at the top.

## Design

### Part A — Closures over captured variables

**Problem**: Nested functions are hoisted to the top level, so they can't capture outer locals like `counter`.

**Approach**: Determine, per nested `fn_decl`, whether it captures any variable from an enclosing scope. If it does, emit it as a **closure** (inline, capturing its environment); if not, hoist it as before.

**Key decisions**:

1. **Capture analysis**: A nested function captures a variable if it references an identifier that is declared in an enclosing scope (not its own params/locals, not global functions/structs). This can be computed by the checker (which knows scope) and recorded on the `FnDeclNode` (e.g. `capturesOuter: boolean` or a list of captured names).

2. **Closure emission**: A capturing nested function is emitted inline where it's declared (inside the enclosing block/constructor body), as a JS function that closes over the enclosing scope's variables. Since JS closures naturally capture enclosing `let`/`var` bindings, emitting the function inline (not hoisted) is sufficient — no explicit capture list needed at the JS level.

3. **Non-capturing functions stay hoisted**: A nested function that references only its own params/locals and global functions/structs is still hoisted to the top level (preserving the current `Outer().Inner()` behavior).

4. **`this` capture**: A nested function that references `this` (its own or via `this.this`) must also be a closure if it needs the enclosing `this`. Since `this` is threaded via `thisName`, a closure emitted inline inherits the enclosing `thisName`.

### Part B — `this.this` climbing

**Problem**: `this.this` currently resolves to only ONE level of outer `this` (via `outerThisType`). Need `this.this.this` (and beyond) to climb multiple levels, ending at global scope.

**Approach**: Replace the single `outerThisType` with a **stack of enclosing `this` types**. Each `.this` pops one level off the stack.

**Key decisions**:

1. **`this` stack**: `CheckContext` carries a stack of enclosing `this` types (innermost first). `withThis(newThisType)` pushes the current `thisType` onto the stack. `this` resolves to the top of the stack; `this.this` resolves to the next; `this.this.this` to the next; etc.

2. **Parsing `this.this.this`**: The parser already builds chained `member_access` nodes (`this.this.this` = `member_access(member_access(member_access(this, this), this), this)`). The checker's `member_access` case must handle a chain of `.this` accesses by walking the stack.

3. **Global scope**: When the stack is exhausted, the next `.this` resolves to the global scope (a bare scope reference). `this.this.this.this` = global scope.

4. **`this.this` as a receiver type**: A nested constructor can take `&mut this.this` / `this.this : &mut Outer` as a receiver. The parser must accept `this.this` as a parameter name (a member-access expression, not a plain identifier), and the checker must resolve its type to the appropriate enclosing `this` type.

### Part C — Chaining (`Counter().add().add().add().counter`)

**Problem**: `add` returns `this.this` (`&Counter`), so each `.add()` yields a `&Counter` and the chain continues on the same object.

**Approach**: This falls out of Parts A and B:

- `add` is a closure (captures `counter`), emitted inline.
- `add` returns `this.this` = `&Counter` (Part B).
- `Counter().add()` desugars to `add(Counter())` — but `add` has no `this` param, so the receiver is dropped (existing `methodCall` logic). Wait — this needs care: `add` returns `&Counter`, and the chain `Counter().add().add()` calls `add` again on the result.

**Key decision**: The chaining works because `add` returns `&Counter` (a reference to the same object), so `Counter().add()` yields `&Counter`, and `.add()` on that calls `add` with the receiver being the `&Counter`. Since `add` has no `this` param, the receiver is dropped and `add` just increments the shared `counter` and returns `this.this` again. The closure captures `counter` from `Counter`'s body, so all calls share the same `counter`.

## Steps

### Step 1 — Capture analysis in the checker (`src/checker.ts`)

- Compute whether each nested `fn_decl` captures any enclosing-scope variable.
- Record it on `FnDeclNode` (e.g. `capturesOuter?: boolean`).
- This requires the checker to know which identifiers in a function body are declared in enclosing scopes.

### Step 2 — Closure vs hoist in codegen (`src/codegen.ts`)

- In the constructor/block body emission, if a nested `fn_decl` has `capturesOuter === true`, emit it **inline** (as a closure) instead of into the `hoisted` buffer.
- Non-capturing nested functions continue to be hoisted.

### Step 3 — `this` stack in the checker (`src/checker.ts`)

- Replace `outerThisType` with a stack of enclosing `this` types.
- `withThis(newThisType)` pushes the current `thisType`.
- Update `this` and `member_access` to resolve `.this` chains against the stack.

### Step 4 — `this.this` chain resolution (`src/checker.ts`)

- Handle `this.this`, `this.this.this`, etc. in `member_access` by walking the stack.
- When the stack is exhausted, resolve to global scope.

### Step 5 — `this.this` as a receiver type (`src/parser.ts`, `src/checker.ts`)

- Allow `this.this` (a member-access expression) as a parameter name in `parseFnDecl`.
- Resolve its type to the appropriate enclosing `this` type in the checker.

### Step 6 — Verify the chaining example

- `fn Counter() => { let mut counter = 0; fn add() => { counter += 1; this.this } this } Counter().add().add().add().counter` => 3.
- Add this as a test case.

### Step 7 — Run hooks

- `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all must pass.

## Risks / Considerations

- **Closure vs hoist correctness**: The capture analysis must be accurate. A function that references a global function/struct (not a captured variable) must still be hoisted. Getting this wrong breaks either closures (not capturing) or hoisting (capturing a non-existent variable).
- **`this` stack depth**: `this.this.this.this` = global scope. The stack must handle arbitrary depth and gracefully resolve to global scope when exhausted.
- **Receiver `this.this`**: Allowing a member-access expression as a parameter name is a significant parser change. The body must reference the receiver consistently (the user said the param name "doesn't matter" — the body accesses the outer `this` via `this.this`).
- **Hoisting interaction**: A capturing nested function can no longer be called from outside its enclosing scope (it's a closure now). This may change behavior for some existing tests (e.g. `Outer().Inner()` where `Inner` is self-contained should still work).
- **`noUncheckedIndexedAccess`**: Guard for `undefined` when walking the `this` stack.
- **ESLint restrictions**: No classes, no `throw`, no backticks, no inline object types, no `Record`, no default `Error`.

## Out of Scope

- Borrow checking / lifetimes.
- `impl` blocks or associated-function syntax.
- Changing the `is` operator semantics.

## Definition of Done

- Nested functions that capture outer variables are emitted as closures; self-contained ones are hoisted.
- `this.this` / `this.this.this` / `this.this.this.this` resolve correctly (climbing to global scope).
- `this.this` is usable as a receiver type in a nested constructor.
- The chaining example `Counter().add().add().add().counter` => 3 works.
- All existing tests pass; hooks pass.
