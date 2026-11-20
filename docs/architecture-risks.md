# Tuff Architecture: Risks, Security, and Future Work

Part of the canonical architecture. The definitions, structure, and performance notes are in [ARCHITECTURE.md](../ARCHITECTURE.md).

## Potential Problems

- **Public API surface growing before the contract is fixed.** Any export becomes a compatibility commitment. Return types should change only while the project has no external callers.
- **Stringly-typed errors.** Plain string messages cannot be matched on, tested precisely, or localized. Use `TuffError` variants.
- **Single-file growth.** `index.ts` is the natural place for "just one more function". Without the layout above it will exceed the file limit quickly.
- **Recursion over the AST must count depth.** Every recursive production in the parser (groups, blocks, `if` branches and condition, `match` scrutinee and arm bodies, prefix `*`) counts toward the shared limit (Invariant 7). A new production that recurses without counting reintroduces a host `RangeError` instead of a `TuffError`. The resolver and evaluator recurse over the same AST, so they inherit the bound.
- **Mutual recursion inside a stage.** In the evaluator, `evaluateIn` calls the conditional, match, block, and chain helpers, and each of them calls `evaluateIn` back. Within one file this works, but it means the helpers cannot move to their own file without an import cycle. The fix is to pass `evaluateIn` to them as an `Evaluate` parameter, as the parser already does with `parseExpr`. The resolver has the same shape (`resolveExpr` and its helpers) and should follow once it grows.
- **Branch undo by snapshot.** An `if` evaluates both branches and undoes the unchosen one's writes by copying every open block's values before each branch and restoring them. A `match` does the same for every arm. The cost is linear in the open slots for each `if` or arm, whatever the branch wrote. The ideal is an undo log of slot writes, so the cost follows the writes made, not the frames held open.
- **Parsing and evaluating in one pass.** A parser that evaluates `let` right-hand sides as it reads them is an evaluator in disguise. It cannot be split into `parser.ts` and `evaluator.ts`, and it cannot report a binding's value without running the whole block. The AST in `ast.ts` is the boundary that prevents this. Any stage that needs a value must go through the evaluator.
- **Error-order drift.** If evaluation can run before the resolver, the reported error depends on evaluation order. For example, `1 / 0 + x` would report `DivisionByZero` instead of `UnknownName`. Invariant 5 forbids this, and tests must pin mixed-error inputs.
- **Shared nesting budget.** Block braces, group parentheses, and prefix `*` share one nesting limit. It lives in `limits.ts`, not in each parser function.
- **Name rules spread across stages.** Shadowing, the `let` keyword, and the ban on re-binding are language rules. If they are checked in more than one place, they will drift. Each rule belongs to one stage, as stated in the Rules above.
- **Parallel name models.** Name slots would be modeled three times (resolver tables, evaluator frames, and `scope.ts`) if each stage kept its own. The ideal is one `scope.ts` definition used by both the resolver and the evaluator. Two models will disagree on shadowing or slot order.
- **Reference checks deferred to evaluation.** `NotAReference`, `ReferenceAsValue`, `ReferenceEscapes`, and a write through a shared reference (`ImmutableAssignment`) are decided only when a value is computed. Only `&mut` of a plain `let` is caught by the resolver. Reading the source alone does not show which `*x = value;` will fail.
- **Kind checks deferred to evaluation.** `BooleanOperand`, `TypeMismatch`, and `NotABoolean` are decided only when a value is computed, so they are reported after the static name errors and cannot be seen by a reader of the source alone. A static kind pass would move them earlier, but it needs a kind for every expression and every `let mut` slot, so it waits until the value model has more kinds.
- **Silent number parsing rules.** Whatever numeric literal grammar Tuff adopts must be defined explicitly in the lexer, not inherited from a host function. Today the parser uses `Number()`, so an integer above 2^53 is rounded without an error: `100000000000000000000001 - 100000000000000000000000` evaluates to 16777216, not 1.
- **Evaluation-phase errors checked in the parser.** Invariant 5 says a literal's overflow is reported when the literal is evaluated. A `match` pattern is checked when it is parsed, so `match (1 / 0) { case <a 400-digit literal> => ...; }` reports `NumericOverflow` where `DivisionByZero` comes first in evaluation order. Literal checks belong in one place for every literal position, and that place is the evaluator.

## Security Concerns

Trust boundaries:

- **Source text is untrusted.** It can come from a user, a file, or (later) a model. Everything that consumes source must treat it as hostile data, never as code to run on the host.
- **The core evaluator has no authority.** It cannot read files, use the network, spawn processes, or touch globals. Any future capability (I/O, imports) must enter through an explicit host-provided interface passed as a parameter, never as an ambient global.

What untrusted input can reach:

- The lexer and parser: crafted input can try to exhaust memory (very long sources, huge token counts) or stack depth (deep nesting).
- The evaluator: Tuff has no loops or functions, so evaluation cannot loop. Crafted input can still try to allocate large values, and the `if` and `match` copies (see Potential Problems) grow with the open frames.

Controls the architecture should have:

1. Maximum source length, checked before lexing. **Missing.**
2. Maximum nesting depth, checked during parsing, producing a `TuffError`. **Satisfied**: the parser counts groups, blocks, `if` branches, `match` scrutinee and arms, and prefix `*` against one limit (256, `NestingTooDeep`). The resolver and evaluator rely on that bound. The limit still lives in `parser.ts`, not `limits.ts`.
3. Step budget in the evaluator, producing a `TuffError` when exhausted. **Missing.** Not needed for termination while Tuff has no loops or functions; required before either exists.
4. No dynamic code execution anywhere in the pipeline. **Satisfied**: no `eval` or `Function` in the code, and lint bans `eval`, implied eval, and `Function` constructors.
5. No ambient authority: the evaluator takes all capabilities as parameters. **Not yet applicable** (no capabilities exist), but the rule is recorded here so it is kept when they are added.
6. Data exposure: error messages must not echo unbounded source text back to the caller. Spans identify the location; names are never copied into a `TuffError`; excerpts must be truncated. **Satisfied today** (spans only); **excerpt rule missing** until excerpts exist.
7. Maximum bindings per block, checked during parsing, producing a `TuffError`. **Missing.**
8. Environments are `Map`s keyed by name, never plain objects, so `constructor` or `toString` cannot resolve to host properties. **Satisfied and pinned by a test.**

Prompt injection and unauthenticated state changes: Tuff has no network, no persistence, and no model integration today. When a model or a file loader is added to the pipeline, its output is untrusted source and must pass the same limits as any user input. Any operation that changes state outside the evaluation must require an explicit host grant. **None exist yet.**

## Future Work

1. Define the Tuff numeric and expression grammar explicitly in the lexer.
2. Add the remaining resource limits (source length, bindings per block, step budget) and tests that each one produces the right `TuffError`.
3. Define a host-capability interface before any feature needs I/O.
4. Add a reviewer lint command in `package.json` that reports architecture-review warnings beyond the standard lint.
