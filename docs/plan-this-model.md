# Plan: Implement the `this` Semantics Specification

## Goal

Implement the full `this` model from `docs/this-semantics.md`, and correct existing tests that encode the old (incomplete) semantics. The spec's core ideas:

- `this` is resolved by **lexical nesting depth** at compile time, not runtime binding.
- There is an implicit `Module` frame at depth 1; true global (depth 0) is unreachable.
- `this.this^k` climbs k frames outward; valid iff `k < D` (D = current depth). Over-climbing is a compile error.
- **Methods and constructors are independent axes** (a function can be neither, either, or both).
- Every `let` at a constructor's top-level body scope becomes a field; capture of an enclosing local is the same mechanism as `this.this` field access.
- Nested functions that reference enclosing state are **closures**; self-contained ones are **hoisted**.
- `::` is namespace lookup (surfaces receiver as explicit param); `.` performs receiver-binding (produces a closure with the receiver bound).
- `this.this` defaults to `&Outer`; `&mut this.this` for mutation; mutable refs are threaded through chains.

## Current State (verified)

### Checker (`src/checker.ts`)

- `CheckContext` has `thisStack: Type[]` (enclosing frames, innermost first) and `depth: number`, replacing the old single-level `outerThisType`. `withThis(newThisType)` pushes the current `thisType` onto the stack and increments depth.
- `this` case: `setNodeType(node, scopeType ?? ctx.thisType ?? { kind: "this" })`.
- `member_access` handles `this.this^k` climbing by walking the stack; valid iff `k < D`; over-climb → compile error ("no such field, because there was no frame there").
- The implicit `Module` frame is the top-level `thisType` (depth 1). `this.x` / `this.this^k.x` on `Module` falls back to scope lookup (Module's fields are the top-level variables).
- `capturesOuterState(node, ownScope)` detects whether a nested function references enclosing-frame state (a `this.this^k` climb or a bare reference to an enclosing local). `is` checks are compile-time and don't count as captures.
- `FnDeclNode.capturesOuter` and `FnSignature.capturesOuter` record the capture analysis.
- `IdentifierNode.capturedField` marks a bare identifier that is a capture of an enclosing constructor's field.
- `CallNode.closureMethodCall` marks a method call to a nested closure (attached to the receiver instance).
- `isConstructorBody` still requires `!hasThisParam` (methods/constructors mutually exclusive — spec §4 decoupling is a remaining item).

### Codegen (`src/codegen.ts`)

- `generateJS(node, isRedeclare?, thisName?, hoisted: string[], outerThisName?)` threads a `hoisted` buffer and an `outerThisName` (the enclosing instance name for `this.this` and captured-field access).
- Nested `fn_decl`s that capture enclosing state are emitted inline as closures and attached to the instance (`__self__`); self-contained ones are hoisted to the top level.
- Constructor path builds the instance as `__self__` (after field declarations), emits closures that close over it, attaches them, and returns it.
- `member_access` for `this.x`: bare scope ref → `x`; receiver → `thisName["x"]` or `thisName.get()["x"]` (ref); `this.this` (k=1) → `outerThisName`; Module field → bare property name.
- A captured-field identifier emits `outer["field"]`; a captured-field assignment emits `outer["field"] = value`.
- A `closureMethodCall` emits `receiver["name"](...)`.

### `index.ts`

- Passes a shared `hoisted: string[]` buffer to each top-level `generateJS` call and emits `hoisted.join(" ")` at the top.

## Existing Tests That Need Correction

The following tests encode the OLD semantics and must be revisited:

1. **`compile("this.x") => scope`** (line 446) — Under the spec, `this.x` at top level is field access on `Module`. If `x` is undeclared, it's still an error, but the _reason_ changes (no such field on Module). Verify the error kind/message still holds.

2. **`compile("this.x = 100;") => scope`** (line 462) — `this.x = 100` at top level assigns to `Module`'s field `x`. If `x` is undeclared, error. Verify.

3. **`fn addOnce(this : I32) => this + 1; 100.addOnce()`** (line 508) — `addOnce` has a `this` param (method) but its body is `this + 1`, NOT a constructor. Under the spec, this is a method, not a constructor. Verify it still works (it should — method-ness is independent).

4. **`fn Counter() => { let mut value = 0; this } fn add(this : &mut Counter) => { this.value += 1; } ...`** (line 579) — `add` is a method (has `this` param). Under the spec, `add`'s body `this.value += 1` — `this` is the receiver param, so `this.value` is field access on the receiver. This should still work.

5. **`fn Counter() => { let mut value = 0; fn add(this : &mut Counter) => { this.value += 1; } this } ...`** (line 588) — `add` is nested inside `Counter` AND has a `this` param. Under the spec, `add` is a method (receiver param) AND its body `this.value += 1` doesn't mention its own `this` as a construction, so it's a method, not a constructor. Verify.

6. **`fn Counter() => { let mut value = 0; fn add(&mut this) => { this.value += 1; } this } ...`** (line 597) — `&mut this` receiver shorthand. Under the spec §9, `&mut` in receiver position is shorthand for `this.this : &mut Counter`. Verify.

7. **`fn Counter() => this is Counter; Counter()`** (line 606) — `Counter` is a constructor (body mentions `this`). `this is Counter` — `this` is Counter's own instance, so `this is Counter` => true. Verify.

8. **`fn Outer() => { fn Inner() => { let field = 100; this } this } Outer().Inner().field`** (line 610) — `Inner` is hoisted (no outer state). Verify it still works.

9. **`fn Outer() => { fn Inner() => { this is Inner } this } Outer().Inner()`** (line 619) — `Inner` is a constructor (body mentions `this`). Verify.

10. **`fn Outer() => { fn Inner() => { this.this is &Outer } this } Outer().Inner()`** (line 628) — `this.this` climbs k=1 to `Outer`. Under the spec, `Inner` is at depth 2, so `this.this` (k=1) is valid. Verify.

**New tests to add** (from the spec):

- `let mut counter = 0; fn add() => { this.this.counter += 1; } add() counter` => 1 (spec §3 example).
- `let x = 0; this.this` => compile error (spec §3 over-climb at depth 1).
- `fn Counter() => { let mut counter = 0; fn add() => { counter += 1; this.this } this } Counter().add().add().add().counter` => 3 (spec §10 chaining).
- `fn Outer() => { fn Inner() => { let field = 100; this } this } Outer().Inner().field` => 100 (spec §11, already exists).
- `fn Outer(&this.this) => { fn Inner(&this.this) => { let field = 100; this } this } Outer().Inner().field` => 100 (spec §12 explicit receiver).

## Design

### Part A — Nesting depth and the `this` stack

**Problem**: `outerThisType` only tracks ONE level. The spec requires arbitrary `this.this^k` climbing with validity `k < D`.

**Approach**: Replace `outerThisType` with a **stack of enclosing `this` types** (innermost first). Track the current nesting depth `D`.

**Key decisions**:

1. `CheckContext` carries `thisStack: Type[]` (the enclosing frames, innermost first) and `depth: number`.
2. `withThis(newThisType)` pushes the current `thisType` onto the stack and increments depth.
3. `this` resolves to `thisType` (top of stack / own frame).
4. `this.this^k` resolves by walking k levels into the stack. Valid iff `k < D`. Over-climb → compile error ("no such field, because there was no frame there").

### Part B — Methods and constructors as independent axes

**Problem**: `isConstructorBody` requires `!hasThisParam`, making methods and constructors mutually exclusive. The spec says they're independent.

**Approach**: Decouple the two classifications.

- **Method** = has a `this`-typed param (receiver). Record on `FnSignature` (already have `receiverType`/`thisIsRef`).
- **Constructor** = body mentions `this` (bare, `this.field`, `this is X`, or wrapped like `Ok(this)`), regardless of params. Record on `FnDeclNode.isConstructor`.

**Key decision**: A function can be both a method and a constructor (e.g. `Inner(&this.this) => { let field = 100; this }`). Codegen must handle a function that takes a receiver AND constructs/returns its own `this`.

### Part C — Fields and capture (spec §5)

**Problem**: Currently, constructor fields come from params + `let` declarations in the body block. The spec says every `let` at the constructor's top-level body scope is a field, and capture of an enclosing local is the same as `this.this` field access.

**Approach**:

1. Ensure every top-level-body-scope `let` in a constructor becomes a field (already mostly done).
2. When a nested function references an enclosing local (bare name), resolve it via the climb (implicit `this.this^k.field`), not as a separate closure-capture mechanism.

**Key decision**: This unifies capture and the climb operator. The checker resolves a bare reference to an enclosing-scope local as a field access through the appropriate `this.this^k` chain.

### Part D — Closures vs hoisting (spec §6)

**Problem**: Nested functions are hoisted to top level, breaking closures.

**Approach**: Determine per nested `fn_decl` whether it references any enclosing-frame state (via `this.this^k` or a bare reference to an enclosing local). If yes → **closure** (emit inline, capturing environment); if no → **hoisted** (emit at top level).

**Key decision**: The capture analysis is the same pass that decides which `this.this` fields need to exist (spec §7). Record `capturesOuter: boolean` on `FnDeclNode`.

### Part E — `::` vs `.` (spec §9)

**Problem**: Currently `.method()` desugars to a plain call with the receiver prepended. The spec distinguishes `::` (namespace lookup, receiver as explicit param) from `.` (receiver-binding, produces a closure).

**Approach**:

1. `::` — namespace-qualified lookup; the receiver surfaces as an explicit leading parameter.
2. `.` — receiver-binding; `c.add` produces a closure with the receiver bound; the receiver disappears from the callable's params.

**Key decision**: This is a larger change. Consider staging it after Parts A–D, since the chaining example (§10) works via `.add()` returning `this.this` without needing full `::`/`.` closure semantics.

### Part F — Chaining (spec §10)

**Problem**: `Counter().add().add().add().counter` => 3.

**Approach**: Falls out of Parts A–D:

- `add` is a closure (captures `counter`), emitted inline.
- `add` returns `this.this` = `&Counter`.
- Each `.add()` returns `&Counter`, so the chain continues on the same object.
- `counter` is a field of `Counter`'s instance (spec §5), mutated via the closure.

## Steps

### Step 1 — `this` stack in the checker (`src/checker.ts`) ✅ DONE

Replace `outerThisType` with `thisStack: Type[]` + `depth`. Update `withThis`, `this`, and `member_access`.

### Step 2 — `this.this^k` climbing (`src/checker.ts`) ✅ DONE

Handle `this.this`, `this.this.this`, etc. in `member_access` by walking the stack. Enforce `k < D`; over-climb → compile error.

### Step 3 — Methods/constructors as independent axes (`src/checker.ts`, `src/codegen.ts`) ⏳ REMAINING

Decouple method-ness from constructor-ness. Update `isConstructorBody` to not require `!hasThisParam`. Handle a function that is both.

### Step 4 — Capture analysis + closures (`src/checker.ts`, `src/codegen.ts`) ✅ DONE

Compute `capturesOuter` per nested `fn_decl`. Emit capturing functions inline (closures); hoist self-contained ones.

### Step 5 — Field/capture unification (`src/checker.ts`) ✅ DONE

Resolve bare references to enclosing locals as `this.this^k.field` accesses.

### Step 6 — Correct existing tests + add new tests (`index.test.ts`) ✅ DONE

Update the tests listed above; add the spec's examples (chaining, over-climb error, explicit receiver). Added: §3 example (`this.this.counter += 1` => 1), over-climb error (`let x = 0; this.this` => scope), §10 chaining (`Counter().add().add().add().counter` => 3). Corrected the two `let temp = this` / `let temp = &this` tests (now valid under the Module-frame model).

### Step 7 — `::` vs `.` (spec §9) — staged ⏳ REMAINING

Implement `::` namespace lookup and `.` receiver-binding closures. This is the largest change; stage it after Parts A–F.

### Step 8 — Run hooks ✅ DONE

`bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all pass.

## Risks / Considerations

- **`this.this^k` validity**: The `k < D` rule must be enforced statically. Getting the depth accounting wrong breaks either valid climbs (false errors) or over-climbs (silent wrong behavior).
- **Methods+constructors**: A function that is both (receiver + constructs own `this`) needs careful codegen — it takes a receiver AND returns its own instance.
- **Closure vs hoist**: The capture analysis must be accurate. A function referencing a global function/struct (not a captured local) must still be hoisted.
- **`::` vs `.`**: This is a significant semantic change to how method calls work. Stage it carefully to avoid breaking the existing `.method()` tests.
- **`noUncheckedIndexedAccess`**: Guard for `undefined` when walking the `this` stack.
- **ESLint restrictions**: No classes, no `throw`, no backticks, no inline object types, no `Record`, no default `Error`.

## Out of Scope

- Borrow checking / lifetimes (spec §8 mentions linear/affine rules but full borrow-checking is a separate effort).
- `impl` blocks or associated-function syntax.
- Stable frame ABI (spec §7 open item).

## Definition of Done

- `this.this^k` climbing works with `k < D` validity; over-climb is a compile error.
- Methods and constructors are independent axes; a function can be both.
- Nested functions that capture enclosing state are closures; self-contained ones are hoisted.
- The chaining example `Counter().add().add().add().counter` => 3 works.
- `::` vs `.` distinction works (staged).
- Existing tests corrected; new spec tests added.
- All tests pass; hooks pass.

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
