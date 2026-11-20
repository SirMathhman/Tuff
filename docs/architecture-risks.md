# Tuff Architecture: Risks, Security, and Future Work

Part of the canonical architecture. The definitions, structure, and performance notes are in [ARCHITECTURE.md](../ARCHITECTURE.md).

## Potential Problems

- **Public API surface growing before the contract is fixed.** Any export becomes a compatibility commitment. Return types should change only while the project has no external callers.
- **Stringly-typed errors.** Plain string messages cannot be matched on, tested precisely, or localized. Use `TuffError` variants.
- **Single-file growth.** `index.ts` is the natural place for "just one more function". Without the layout above it will exceed the file limit quickly.
- **Unbounded recursion in the evaluator.** The parser caps group nesting at 256 and reports `NestingTooDeep`. Any later recursive stage must enforce the same limit (or a shared one in `limits.ts`) and produce a `TuffError`, not a `RangeError` crash.
- **Parsing and evaluating in one pass.** A parser that evaluates `let` right-hand sides as it reads them is an evaluator in disguise. It cannot be split into `parser.ts` and `evaluator.ts`, and it cannot report a binding's value without running the whole block. The AST in `ast.ts` is the boundary that prevents this. Any stage that needs a value must go through the evaluator.
- **Error-order drift.** If evaluation can run before the resolver, the reported error depends on evaluation order. For example, `1 / 0 + x` would report `DivisionByZero` instead of `UnknownName`. Invariant 5 forbids this, and tests must pin mixed-error inputs.
- **Shared nesting budget.** Block braces and group parentheses share one nesting limit. It lives in `limits.ts`, not in each parser function.
- **Name rules spread across stages.** Shadowing, the `let` keyword, and the ban on re-binding are language rules. If they are checked in more than one place, they will drift. Each rule belongs to one stage, as stated in the Rules above.
- **Parallel name models.** Name slots would be modeled three times (resolver tables, evaluator frames, and `scope.ts`) if each stage kept its own. The ideal is one `scope.ts` definition used by both the resolver and the evaluator. Two models will disagree on shadowing or slot order.
- **Kind checks deferred to evaluation.** `BooleanOperand` and `TypeMismatch` are decided only when a value is computed, so they are reported after the static name errors and cannot be seen by a reader of the source alone. A static kind pass would move them earlier, but it needs a kind for every expression and every `let mut` slot, so it waits until the value model has more kinds.
- **Silent number parsing rules.** Whatever numeric literal grammar Tuff adopts must be defined explicitly in the lexer, not inherited from a host function.

## Security Concerns

Trust boundaries:

- **Source text is untrusted.** It can come from a user, a file, or (later) a model. Everything that consumes source must treat it as hostile data, never as code to run on the host.
- **The core evaluator has no authority.** It cannot read files, use the network, spawn processes, or touch globals. Any future capability (I/O, imports) must enter through an explicit host-provided interface passed as a parameter, never as an ambient global.

What untrusted input can reach:

- The lexer and parser: crafted input can try to exhaust memory (very long sources, huge token counts) or stack depth (deep nesting).
- The evaluator: crafted input can try to loop forever or allocate large values.

Controls the architecture should have:

1. Maximum source length, checked before lexing. **Missing.**
2. Maximum nesting depth, checked during parsing and evaluation, producing a `TuffError`. **Satisfied in the parser** (256 groups, `NestingTooDeep`); **missing in the evaluator**, which does not exist yet.
3. Step budget in the evaluator, producing a `TuffError` when exhausted. **Missing.**
4. No dynamic code execution anywhere in the pipeline. **Satisfied today** (no `eval` or `Function` in the code), but must be enforced by a lint rule banning `eval` and `Function` constructors. **Lint rule missing.**
5. No ambient authority: the evaluator takes all capabilities as parameters. **Not yet applicable** (no capabilities exist), but the rule is recorded here so it is kept when they are added.
6. Data exposure: error messages must not echo unbounded source text back to the caller. Spans identify the location; names are never copied into a `TuffError`; excerpts must be truncated. **Satisfied today** (spans only); **excerpt rule missing** until excerpts exist.
7. Maximum bindings per block, checked during parsing, producing a `TuffError`. **Missing.**
8. Environments are `Map`s keyed by name, never plain objects, so `constructor` or `toString` cannot resolve to host properties. **Satisfied and pinned by a test.**

Prompt injection and unauthenticated state changes: Tuff has no network, no persistence, and no model integration today. When a model or a file loader is added to the pipeline, its output is untrusted source and must pass the same limits as any user input. Any operation that changes state outside the evaluation must require an explicit host grant. **None exist yet.**

## Future Work

1. Add lint enforcement of the modularity limits and the no-`eval` rule, plus a reviewer lint command in `package.json`.
2. Define the Tuff numeric and expression grammar explicitly in the lexer.
3. Add the remaining resource limits (source length, bindings per block, step budget) and tests that each one produces the right `TuffError`.
   3a. Reject a kind change on assignment with `TypeMismatch`, and pin the boolean operand ordering with tests.
