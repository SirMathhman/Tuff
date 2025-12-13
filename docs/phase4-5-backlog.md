# Phase 4/5 Backlog (next increments)

This is a **working** list of the smallest, highest-leverage items to tackle next for Phase 4 (analyzer) and Phase 5 (JS emitter). It intentionally ignores any C-backend work.

## Baseline

- `npm test` currently passes (Vitest TS tests, including the staged `.tuff` suites via `tuff_tests_runner`).

## ✅ Definition of “Done” (Phase 4/5 feature-complete, not optimized)

Phase 4/5 is “done enough to move on” when **all** items below are true. This is deliberately **not** an optimization bar; it’s a *feature-completeness + stability* bar.

### Phase 4 (Analyzer) — done when

**A. Sound-enough checks for the bootstrap subset**

- [ ] **No-shadowing** is enforced everywhere (already true today).
- [ ] **Mutability rules** are enforced:
	- assigning to immutable bindings is rejected
	- assigning through immutable bindings (e.g. `p.x = 1` when `p` is immutable) is rejected
- [ ] **Function checking** is present and stable:
	- arity checks for known functions
	- when types are enforceable: argument type checks + return type checks
	- generic functions: explicit specialization rules (no unspecialized generic as value)
- [ ] **Struct checking** is present:
	- unknown struct rejected
	- wrong number of literal fields rejected
	- field existence checks on access
	- (when annotated) field value type checking
- [ ] **Tuple checking** is present:
	- tuple literal arity preserved
	- `.0/.1/...` indexing is validated
- [ ] **Union support is present**:
	- narrowing (`is`, `is not`, tag comparisons, negation forms) gates payload access
	- union-variant match patterns supported
	- exhaustiveness-lite match check (all variants or `_`)
	- payload typing under narrowing is good enough to typecheck common code (at least typed `let` initializers)
- [ ] **Array initialization tracking** matches the language rule for literal indices (current scope) and is stable.

**B. Diagnostics behavior**

- [ ] The analyzer **does not abort on the first error**. It should collect and report multiple errors per file (parser-like behavior).
- [ ] Diagnostics include file/line/column and a code frame (existing diagnostics format), and are stable across runs.

**C. Self-host stability gates**

- [ ] `npm test` passes.
- [ ] `npm run build:selfhost-prebuilt` succeeds and regenerates `selfhost/prebuilt/`.
- [ ] Stage3 == Stage4 fixed-point checks remain green (via tests / bootstrap check).

### Phase 5a (JS Emitter) — done when

**A. Coverage (no missing emit cases)**

- [ ] Every AST node produced by the parser/analyzer has a JS emission path.
- [ ] No emitter panics for valid programs in the bootstrap subset.

**B. Semantic correctness (not prettiness)**

- [ ] Operator precedence is correct (binary/unary/call/index/field).
- [ ] Side-effecting statements are preserved (no dropped `SExpr`).
- [ ] `match` emission works for:
	- literals (`I32`, `Bool`, `String`)
	- union variant matches (switching on `.tag`)
- [ ] `if` as expression is emitted correctly (including block branches).
- [ ] `while` loops, `loop`, `break`, `continue`, and `yield` emit correctly.

**C. Modules and compilation**

- [ ] `compile_project` correctly emits multi-file ES module graphs:
	- `from X use { ... }` resolves and produces correct relative imports
	- `extern from X use { ... }` emits the correct runtime import shape
	- output paths are stable and deterministic

### “We can move on” line

When Phase 4 and Phase 5a meet the above, we stop calling them “in progress” and move the project’s attention to *new* features (stdlib growth, richer pattern matching, destructuring, constant folding, etc.).

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

✅ Done

- After narrowing, `.value` access should infer the correct payload type, including basic generic substitution (e.g. `Option<I32>` ⇒ `.value` is `I32`).

Implemented (bootstrap scope):

- `.value` remains **gated** by narrowing.
- For typed `let` initializers, payload types are inferred under narrowing, including basic generic substitution.

Suggested tests:

- In a narrowed `Option<I32>`, `let x: I32 = opt.value;` should pass.
- In a narrowed `Option<I32>`, `let x: String = opt.value;` should fail.

4. **Match checks for union variants (exhaustiveness-lite)**

✅ Done

- Start with a pragmatic rule: when scrutinee is a known union type, require either `_` arm or all variants appear.

Implemented (bootstrap scope):

- `match (x) { Some => ..., None => ... }` is now accepted (no `_` required when exhaustive).
- Union-variant patterns (`Some`, `M::Some`) are supported.
- Analyzer enforces exhaustiveness-lite for union scrutinees.

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

Implemented (bootstrap scope):

- `if (x is Some)` narrows `then`.
- `if (x.tag != "Some") { ... } else { ... }` narrows `else`.
- `if (!(x is Some)) { ... } else { ... }` narrows `else`.
- `x is not Some` is supported (desugars to `x.tag != "Some"`).

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
