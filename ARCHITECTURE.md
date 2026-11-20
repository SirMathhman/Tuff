# Tuff Architecture

This is the canonical description of the architecture Tuff is working toward. It describes the ideal design, not the current code. Progress is tracked in the git log.

## Definitions

- **Tuff source**: a UTF-8 string written by a user or read from a file. It is untrusted input.
- **Public API**: the exports of `index.ts`. Only these are stable. Everything else is internal.
- **Evaluation**: a pure function from Tuff source to a `Result`. It performs no I/O, reads no environment, and never executes host JavaScript (no `eval`, no `new Function`).
- **Result**: the only error channel. A function returns `{ ok: true, value }` or `{ ok: false, error }`. Exceptions are not used for expected failures, and a function never returns `NaN` or another sentinel to signal failure.
- **TuffError**: a discriminated union (error enum) of failure kinds. Each variant carries enough data to answer: what the error is, where in the source it occurred (span: start and end offsets), why it is an error, and what the caller can change to fix it.
- **Operator**: a binary function from two numbers to a `Result` whose error type is a narrow literal union naming the failure (for example `"DivisionByZero"`). The operator never sees source positions. The parser attaches the operator token's span and widens the failure to a `TuffError`.
- **Finite result**: every value Tuff returns is a finite number. Overflow to `Infinity` and any `NaN` are failures, reported as a `TuffError`, never returned as a value.
- **Invariant 1**: the same source always yields the same `Result`. There is no hidden state between calls.
- **Invariant 2**: evaluation always terminates or returns a `TuffError` for resource exhaustion. It never hangs the caller.
- **Invariant 3**: a module under `src/` never imports from `index.ts`.

## Structure

Target layout (none of the `src/` modules exist yet):

```
index.ts            public API only: re-exports evaluateTuff and the public types
src/
  result.ts         Result type and helpers (ok, err, map, unwrap-for-tests)
  errors.ts         TuffError enum and message/span helpers
  span.ts           source positions shared by all stages
  lexer.ts          source -> token stream
  parser.ts         token stream -> AST
  ast.ts            AST node types (no logic)
  evaluator.ts      AST -> value, with resource limits
  limits.ts         configurable limits (max depth, max steps, max source length)
```

Dependency direction (arrows mean "may import"):

```
index.ts -> evaluator.ts -> parser.ts -> lexer.ts -> span.ts
                          \-> ast.ts      \-> errors.ts -> span.ts
result.ts is imported by every stage; it imports nothing.
```

Rules:

- Dependencies flow one way, from `index.ts` toward the leaves. No cycles between files.
- Each stage is a pure function from its input type to a `Result` of its output type. A stage never calls a later stage.
- Recursion is allowed only inside the parser and evaluator, and only over the AST. Mutual recursion between functions in different files is forbidden. Where two functions must call each other, pass one as a parameter.
- Limits: 100 lines per function, 500 code lines per file, 10 files per directory. These are enforced by lint (see Future Work).

## Potential Problems

- **Non-finite numbers.** IEEE arithmetic does not fail on its own. Digit literals with more than about 308 digits parse to `Infinity`, and `Infinity - Infinity` or an overflowing product yields `Infinity` or `NaN` as a plain value. Without a finite-result check, these escape the `Result` channel.
- **Public API surface growing before the contract is fixed.** Any export becomes a compatibility commitment. Return types should change only while the project has no external callers.
- **Stringly-typed errors.** Plain string messages cannot be matched on, tested precisely, or localized. Use `TuffError` variants.
- **Single-file growth.** `index.ts` is the natural place for "just one more function". Without the layout above it will exceed the file limit quickly.
- **Unbounded recursion.** Deeply nested input can overflow the JavaScript call stack, which surfaces as a thrown `RangeError`. The depth limit in `limits.ts` must produce a `TuffError`, not a crash.
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
2. Maximum nesting depth, checked during parsing and evaluation, producing a `TuffError`. **Missing.**
3. Step budget in the evaluator, producing a `TuffError` when exhausted. **Missing.**
4. No dynamic code execution anywhere in the pipeline. **Satisfied today** (no `eval` or `Function` in the code), but must be enforced by a lint rule banning `eval` and `Function` constructors. **Lint rule missing.**
5. No ambient authority: the evaluator takes all capabilities as parameters. **Not yet applicable** (no capabilities exist), but the rule is recorded here so it is kept when they are added.
6. Data exposure: error messages must not echo unbounded source text back to the caller. Spans identify the location; excerpts must be truncated. **Missing.**

Prompt injection and unauthenticated state changes: Tuff has no network, no persistence, and no model integration today. When a model or a file loader is added to the pipeline, its output is untrusted source and must pass the same limits as any user input. Any operation that changes state outside the evaluation must require an explicit host grant. **None exist yet.**

## Future Work

1. Split `index.ts` into the `src/` layout above, keeping `index.ts` as a thin re-export, and add the evaluator stage.
2. Add lint enforcement of the modularity limits and the no-`eval` rule.
3. Define the Tuff numeric and expression grammar explicitly in the lexer.
4. Add the finite-result check (a `NumericOverflow` variant for overflow and `NaN`) to every operator path.
5. Add the resource limits (source length, nesting depth, step budget) and tests that each one produces the right `TuffError`.
6. Define a host-capability interface before any feature needs I/O.

## Performance

Obvious concerns only; profile before optimizing.

- Lexing and parsing are linear in source length and should stay that way. Avoid re-scanning the input for each token.
- Evaluation cost is controlled by the step budget, not by the source length alone. Large literals or repeated operations can dominate.
- Error construction should be lazy: do not build excerpts or messages on the success path.
