# Plan: Make `generateJS` Handle All Node Kinds Uniformly

## Goal

Eliminate the split-brain between `index.ts` and `codegen.ts` over how statements are emitted. Today `generateJS` (in `src/codegen.ts`) handles only expression-level nodes, while `index.ts` special-cases `let_decl`, `fn_decl`, and `struct_decl` at the top level. This forces ad-hoc duplication (e.g. the constructor-block codegen manually re-implements `let` emission because `generateJS` can't handle `let_decl`). The goal is to make `generateJS` the single authority for emitting every node kind, so `index.ts` just orchestrates the exit-code model.

## Current State (verified)

`generateJS(node)` in `src/codegen.ts` handles these node kinds: `number`, `boolean`, `identifier`, `this`, `member_access`, `binary_op`, `is`, `fn_decl`, `call`, `ref`, `deref`, `deref_assign`, `assign`, `array`, `index`, `struct_decl`, `struct_init`, `tuple`, `tuple_index`, `if`, `block`, `while`. It does **NOT** handle `let_decl` (falls through to the `default` error).

`index.ts` `compileTuffToJS` manually special-cases the top-level statements:

- `let_decl` → emits `let name = value;` (or `name = value;` on redeclare), tracking a `declared` set.
- `fn_decl` → emits via `generateJS`.
- `struct_decl` → emits via `generateJS`.
- everything else → emits via `generateJS`, wrapping the last one in `process.exit(Number(...))`.

### Problems

1. **`let_decl` has no codegen case.** `generateJS` can't emit a `let` declaration, so:
   - `index.ts` must special-case it at the top level.
   - The constructor-block codegen (in `fn_decl`) must manually re-implement `let name = value;` emission (the `if (stmt.kind === "let_decl")` branch).
   - The `block` codegen would fail on a block containing a `let_decl` (it calls `generateJS` on every statement), which is why constructor blocks needed the manual branch.
2. **`assign` is handled in codegen but `let_decl` isn't** — inconsistent: both are statements, but only one is codegen-able.
3. **`index.ts` duplicates emission logic** that belongs in codegen (the `let`/redeclare logic, the `declared` set).

## Design

Add a `let_decl` case to `generateJS` so it can emit a `let` declaration, and refactor `index.ts` to delegate all statement emission to `generateJS`, keeping only the exit-code orchestration.

### Key decisions

1. **`generateJS` handles `let_decl`.** Add a case that emits `let <name> = <value>;`. This makes `generateJS` total over all node kinds (the `default` error becomes truly unreachable for valid ASTs).
2. **`index.ts` delegates to `generateJS`.** Replace the manual `let_decl`/`fn_decl`/`struct_decl` branches with a single `generateJS(stmt)` call for every statement. `index.ts` keeps only:
   - the `declared` set (to decide `let` vs redeclare `name = value`), OR
   - better: move the redeclare decision into codegen via a flag/context (see step 4).
3. **Constructor-block codegen reuses the block logic.** Once `generateJS` handles `let_decl`, the `fn_decl` constructor-block branch can emit statements uniformly (no manual `let` branch), and the `block` codegen case works for blocks containing `let_decl`.

### The `declared` set question

`index.ts` currently tracks a `declared: Set<string>` to decide whether a top-level `let x = ...` emits `let x = ...` (first time) or `x = ...` (redeclare). This is top-level-only state. Two options:

- **Option A (minimal):** Keep the `declared` set in `index.ts`, but have `generateJS` accept an optional `isRedeclare` flag (or a small `CodegenContext`) so it can emit `let` vs `=` correctly. `index.ts` still owns the set.
- **Option B (cleaner):** Add a `CodegenContext` threaded through `generateJS` (like the checker's `CheckContext`) holding the `declared` set, so codegen owns the whole decision. This is more invasive but fully centralizes emission.

Recommend **Option A** for this refactor (smaller, lower-risk), with a note that Option B is the natural follow-up if more statement-level state accumulates.

## Steps

1. **`src/codegen.ts` — add `let_decl` case.** Emit `let <name> = <value>;` (or `name = value;` when redeclaring, if the flag is threaded). Reuse `generateJS(node.value)` for the RHS.

2. **`src/codegen.ts` — constructor-block branch.** Remove the manual `if (stmt.kind === "let_decl")` branch; emit all non-final block statements via `generateJS` uniformly (now that `let_decl` is handled).

3. **`src/codegen.ts` — `block` case.** Verify it now works for blocks containing `let_decl` (it already calls `generateJS` on every statement; with step 1 it will succeed). No change needed beyond step 1.

4. **`src/index.ts` — delegate to `generateJS`.** Replace the `let_decl`/`fn_decl`/`struct_decl` special-casing with a single `generateJS(stmt)` call per statement. Keep the `declared` set and pass a redeclare flag to `generateJS` for `let_decl` (Option A), or move the set into a `CodegenContext` (Option B).

5. **Run hooks:** `bun test` (all 102 must pass), `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle`.

## Risks / Notes

- **Exit-code model must be preserved.** `index.ts` must still wrap only the final _expression_ statement in `process.exit(Number(...))`; declarations (`let_decl`, `fn_decl`, `struct_decl`) must never produce an exit code. The delegation must keep this distinction (e.g. check `isExpression(stmt)` or the node kind before wrapping).
- **`noUncheckedIndexedAccess`:** `node.value`/`node.name` access must keep existing guards.
- **ESLint restrictions:** no classes (use factory/context style), no `Record` (use `Map`), no inline object types (use named interfaces), no `throw` (use `Result`).
- **No behavior change:** pure refactor; all 102 tests must pass unchanged.
- **CPD:** the refactor should _reduce_ duplication (the manual `let` branch in the constructor codegen disappears).
- **`isExpression`:** `let_decl` and `assign` are statements; `index.ts` should use this (or the node kind) to decide exit-code wrapping, not a hardcoded list.
