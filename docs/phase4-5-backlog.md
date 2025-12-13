# Phase 4/5 Backlog (next increments)

This is a **working** list of the smallest, highest-leverage items to tackle next for Phase 4 (analyzer) and Phase 5 (JS emitter). It intentionally ignores any C-backend work.

## Baseline

- `npm test` currently passes (Vitest TS tests, including the staged `.tuff` suites via `tuff_tests_runner`).

## Phase 4 (Analyzer) — smallest next wins

### P0 — immediate correctness + developer experience

1. **Stop panicking on first analyzer error; collect diagnostics**

- Current analyzer uses `panic_at(...)`, which aborts analysis and limits error feedback.
- Target behavior: accumulate multiple errors per file and report them together (like parsing).

Suggested tests:

- New TS test that compiles a file containing 2+ independent type/name errors and asserts both diagnostics are present.

2. **Implement source-level union narrowing syntax: `if (x is Variant)`** ✅

- The spec describes `is` as the primary narrowing feature.
- Done: the parser now desugars `x is Variant` to `x.tag == "Variant"`, reusing the analyzer’s existing narrowing logic.

Suggested tests:

- `if (opt is Some) { opt.value }` should be accepted.
- `opt.value` without prior narrowing should be rejected.
- `if (opt is None) { opt.value }` should be rejected (“variant has no payload”).

### P1 — type system coverage

3. **Union payload field typing (`.value`)**

- After narrowing, `.value` access should infer the correct payload type, including basic generic substitution (e.g. `Option<I32>` ⇒ `.value` is `I32`).

Suggested tests:

- In a narrowed `Option<I32>`, `let x: I32 = opt.value;` should pass.
- In a narrowed `Option<I32>`, `let x: String = opt.value;` should fail.

4. **Match checks for union variants (exhaustiveness-lite)**

- Start with a pragmatic rule: when scrutinee is a known union type, require either `_` arm or all variants appear.

Suggested tests:

- `match (opt) { Some => 1 }` should fail unless `_` or `None` arm exists.

### P2 — safety + flow-sensitive precision

5. **Array/slice index checks beyond literal indices (lightweight)**

- Today array init/bounds checks are only enforced when the index is an integer literal.
- Next step: when index is a local with a known constant value (simple constant propagation), reuse the same checks.

Suggested tests:

- `let i = 2; buf[i]` should be rejected when `i >= initialized`.

6. **Narrowing propagation rules for `if` and `match`**

- Clarify and enforce what gets narrowed in `then` vs `else`.
- Optional: support `if (!(x is Some)) { ... }` later.

## Phase 5a (JS Emitter) — smallest next wins

### P0 — correctness

1. **Precedence correctness audit (binary + unary + call + index + field)**

- Ensure generated JS inserts parentheses when needed.

Suggested tests:

- Add `.test.tuff` cases that compile and run, asserting results for tricky precedence expressions.

2. **Statement preservation**

- Ensure standalone side-effecting expressions (`SExpr`) are never dropped.

Suggested tests:

- A `.test.tuff` that calls an extern function with side effects and verifies it ran.

### P1 — output quality

3. **Smaller/cleaner JS output without changing semantics**

- Avoid redundant temporaries when safe.
- Emit stable formatting for diffs.

Suggested tests:

- Snapshot-style TS test that compiles a small snippet and asserts emitted output contains/omits specific patterns.

## Notes

- This backlog is intentionally incremental: each item should be doable with 1–3 tests + a small patch.
- When implementing, prefer changing one behavior at a time and keeping selfhost stability.
