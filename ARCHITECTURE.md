# Tuff Architecture

This is the canonical description of the architecture Tuff is working toward. It describes the ideal design, not the current code. Progress is tracked in the git log.

## Definitions

- **Tuff source**: a UTF-8 string written by a user or read from a file. It is untrusted input.
- **Public API**: the exports of `index.ts`. Only these are stable. Everything else is internal.
- **Evaluation**: a pure function from Tuff source to a `Result`. It performs no I/O, reads no environment, and never executes host JavaScript (no `eval`, no `new Function`).
- **Result**: the only error channel. A function returns `{ ok: true, value }` or `{ ok: false, error }`. Exceptions are not used for expected failures, and a function never returns `NaN` or another sentinel to signal failure.
- **TuffError**: a discriminated union (error enum) of failure kinds. Each variant carries its kind and the span where it occurred (start and end offsets). `describeError` answers what the error is, where it is, why it is an error, and what the caller can change to fix it. It derives the wording from the kind, so no text is built on the failure path.
- **Operator**: a binary function from two numbers to a `Result` whose error type is a narrow union of `TuffErrorKind` members (for example `DivisionByZero`). The operator never sees source positions. The evaluator attaches the operator token's span and widens the failure to a `TuffError`.
- **Finite result**: every value Tuff returns is a finite number. Overflow to `Infinity` and any `NaN` are failures, reported as a `TuffError`, never returned as a value.
- **Block**: a sequence of zero or more bindings followed by one final expression, optionally wrapped in `{ }`. The whole source is a block without braces. A block is the only construct that creates a scope.
- **Binding**: `let NAME = expr;` or `let mut NAME = expr;`. It introduces a name for the rest of its block. Only a `let mut` binding may be changed later; assigning a plain `let` binding is `ImmutableAssignment`.
- **Assignment**: `NAME = expr;`. It changes the value of a `let mut` binding, found by the same lookup as a read, so a nested block may assign a `mut` binding of an enclosing block. The right-hand side is evaluated before the name exists, so `let x = x;` refers to an outer `x` or fails with `UnknownName`.
- **Scope**: the lexical environment of one block: its bindings plus a link to the enclosing scope. Lookup walks outward and stops at the first match. A scope exists only while its block is being evaluated.
- **Invariant 1**: the same source always yields the same `Result`. There is no hidden state between calls.
- **Invariant 2**: evaluation always terminates or returns a `TuffError` for resource exhaustion. It never hangs the caller.
- **Invariant 3**: a module under `src/` never imports from `index.ts`.
- **Invariant 4**: a name is bound at most once per block (`DuplicateName`). A nested block may shadow an outer name. Every name used must resolve to a binding in scope (`UnknownName`). Both are static errors: decided from the source before any value is computed.
- **Invariant 5**: errors are reported in phase order. Lexical, syntax, and duplicate-name errors come first, then unknown-name errors, then evaluation errors (`DivisionByZero`, `NumericOverflow`). The reported error never depends on the order in which values happen to be computed. For example, `1 / 0 + x` reports `UnknownName`.
- **Invariant 6**: name lookup uses `Map`-based scopes only, never plain objects, so a name such as `constructor` cannot reach host prototype properties.

## Structure

Target layout:

```
index.ts            public API: exports evaluateTuff (which composes the stages) and the public types
src/
  result.ts         Result type and helpers (ok, err, map, unwrap-for-tests)
  errors.ts         TuffError enum and message/span helpers
  span.ts           source positions shared by all stages
  lexer.ts          source -> token stream
  parser.ts         token stream -> AST
  ast.ts            AST node types (no logic): literals, names, operators, groups, blocks, bindings
  scope.ts          Scope type, creation, and name lookup (no evaluation)
  resolver.ts       AST -> Result<void, TuffError>: checks every name is bound. Computes no values
  evaluator.ts      AST -> value: walks blocks, creates scopes, applies operators, enforces limits
  limits.ts         configurable limits (max depth, max steps, max source length)
```

Dependency direction (arrows mean "may import"):

```
index.ts       -> lexer.ts, parser.ts, resolver.ts, evaluator.ts, errors.ts, result.ts (evaluateTuff composes the stages; re-exports the public types)
evaluator.ts   -> ast.ts, scope.ts, errors.ts, result.ts (limits.ts once it exists)
resolver.ts    -> ast.ts, scope.ts, errors.ts, result.ts
parser.ts      -> lexer.ts, ast.ts, errors.ts, result.ts, span.ts
lexer.ts       -> errors.ts, result.ts, span.ts
scope.ts       -> nothing (generic over the stored value)
errors.ts      -> span.ts
ast.ts         -> span.ts
limits.ts      -> nothing (not yet created)
result.ts      -> nothing; imported by every stage
```

Rules:

- Dependencies flow one way, from `index.ts` toward the leaves. No cycles between files.
- Each stage is a pure function from its input type to a `Result` of its output type. A stage never calls a later stage.
- Name checks run before evaluation. `DuplicateName` is a property of the block's syntax, so the parser reports it when it builds a `Block`. `UnknownName` is reported by `resolver.ts`, a static pass over the AST that uses `scope.ts`. The resolver records the binding of every name use as a block depth and a position within that block, and the evaluator reads values by that reference. The evaluator never reports a name error. It reports `InternalError` only if the resolver and evaluator disagree, which is a bug in Tuff.
- The parser must not evaluate and must not look up names. Its output is a syntactically valid AST and nothing more.
- Recursion is allowed only inside the parser and evaluator, and only over the AST. Mutual recursion between functions in different files is forbidden. Where two functions must call each other, pass one as a parameter.
- Limits: 100 lines per function, 500 code lines per file, 10 files per directory. These must be enforced by lint (see Future Work). Lint does not enforce them yet.

## Potential Problems

- **Public API surface growing before the contract is fixed.** Any export becomes a compatibility commitment. Return types should change only while the project has no external callers.
- **Stringly-typed errors.** Plain string messages cannot be matched on, tested precisely, or localized. Use `TuffError` variants.
- **Single-file growth.** `index.ts` is the natural place for "just one more function". Without the layout above it will exceed the file limit quickly.
- **Unbounded recursion in the evaluator.** The parser caps group nesting at 256 and reports `NestingTooDeep`. Any later recursive stage must enforce the same limit (or a shared one in `limits.ts`) and produce a `TuffError`, not a `RangeError` crash.
- **Parsing and evaluating in one pass.** A parser that evaluates `let` right-hand sides as it reads them is an evaluator in disguise. It cannot be split into `parser.ts` and `evaluator.ts`, and it cannot report a binding's value without running the whole block. The AST in `ast.ts` is the boundary that prevents this. Any stage that needs a value must go through the evaluator.
- **Error-order drift.** If evaluation can run before the resolver, the reported error depends on evaluation order. For example, `1 / 0 + x` would report `DivisionByZero` instead of `UnknownName`. Invariant 5 forbids this, and tests must pin mixed-error inputs.
- **Shared nesting budget.** Block braces and group parentheses share one nesting limit. It lives in `limits.ts`, not in each parser function.
- **Name rules spread across stages.** Shadowing, the `let` keyword, and the ban on re-binding are language rules. If they are checked in more than one place, they will drift. Each rule belongs to one stage, as stated in the Rules above.
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
4. Define a host-capability interface before any feature needs I/O.

## Performance

Obvious concerns only; profile before optimizing.

- Lexing and parsing are linear in source length and should stay that way. Avoid re-scanning the input for each token.
- Evaluation cost is controlled by the step budget, not by the source length alone. Large literals or repeated operations can dominate.
- Name lookup walks the enclosing scopes, so one lookup costs time proportional to block nesting. The nesting limit bounds that. A block with no bindings should not allocate a scope map.
- Error construction should be lazy: do not build excerpts or messages on the success path.
