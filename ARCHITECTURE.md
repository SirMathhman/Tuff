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
- **Boolean**: `true` or `false`, a value distinct from a number. Arithmetic on a boolean is a `BooleanOperand` error. A source whose final value is a boolean is returned as 1 for `true` and 0 for `false`, so the result is always a number. A binding keeps the kind (number or boolean) of the value it was declared with. Assigning a value of the other kind is a `TypeMismatch` error at the assignment target.
- **Language constructs**: references, conditionals, and matches are defined in [docs/language.md](docs/language.md).
- **Block**: a sequence of zero or more statements (`let`, assignment, and braced block) followed by an optional final expression, optionally wrapped in `{ }`. A braced block used as a value (a `let` right-hand side, an operand, or the last item of its block) must end in a final expression: `{ }` and `{ let x = 0; }` in value position are `UnexpectedToken` errors at the closing brace. A braced block followed by a new statement is a statement: it needs no `;`, its value is discarded, and it has no final expression (`{ x = 1; } 0` is valid; `{ 1 } 0` is an error). A source with statements but no final expression evaluates to 0, and an empty source is an error. The whole source is a block without braces. A block is the only construct that creates a scope.
- **Binding**: `let NAME = expr;` or `let mut NAME = expr;`. It introduces a name for the rest of its block. Only a `let mut` binding may be changed later; assigning a plain `let` binding is `ImmutableAssignment`.
- **Assignment**: `NAME = expr;`. It changes the value of a `let mut` binding, found by the same lookup as a read, so a nested block may assign a `mut` binding of an enclosing block. The right-hand side is evaluated before the name exists, so `let x = x;` refers to an outer `x` or fails with `UnknownName`.
- **Scope**: the lexical environment of one block: its bindings plus a link to the enclosing scope. Lookup walks outward and stops at the first match. A scope exists only while its block is being evaluated.
- **Invariant 1**: the same source always yields the same `Result`. There is no hidden state between calls.
- **Invariant 2**: evaluation always terminates or returns a `TuffError` for resource exhaustion. It never hangs the caller.
- **Invariant 3**: a module under `src/` never imports from `index.ts`.
- **Invariant 4**: a name is bound at most once per block (`DuplicateName`). A nested block may shadow an outer name. Every name used must resolve to a binding in scope (`UnknownName`). Both are static errors: decided from the source before any value is computed.
- **Invariant 5**: errors are reported in phase order. Lexical, syntax, and duplicate-name errors come first. Then the static name errors (`UnknownName`, `ImmutableAssignment`), in source order. Then evaluation errors (every kind decided while computing a value, such as `DivisionByZero`, `NotABoolean`, and `ImmutableAssignment` for a write through a shared reference), including the overflow of a numeric literal, which is checked when the literal is evaluated, not when it is parsed. Within one operator, an error in the left operand is reported before one in the right operand, and both before the operator's own error. The reported error depends only on the source, never on runtime state. For example, `1 / 0 + x` reports `UnknownName`, and `true + 1 / 0` reports `DivisionByZero`.
- **Invariant 6**: name lookup uses `Map`-based scopes only, never plain objects, so a name such as `constructor` cannot reach host prototype properties.
- **Invariant 7**: nesting is bounded. Block braces, group parentheses, prefix `*`, and the bodies of `if` and `match` share one nesting limit. Exceeding it is `NestingTooDeep`, never a host stack overflow.

## Structure

The module layout, the dependency direction between modules, and the rules for recursion and name checks are in [docs/structure.md](docs/structure.md). The short form: dependencies point one way from `index.ts` toward the leaves; each stage (lexer, parser, resolver, evaluator) is a pure function from its input to a `Result`; recursion over the AST goes through one entry point per stage, and helpers receive that entry point as a parameter instead of importing it.

## Risks, Security, and Future Work

See [docs/architecture-risks.md](docs/architecture-risks.md) for potential problems, security concerns, and future work.

## Performance

Obvious concerns only; profile before optimizing.

- Lexing and parsing are linear in source length and should stay that way. Avoid re-scanning the input for each token. The ideal finds the matching brace of every block in one pass while lexing, so deciding whether a braced block is a statement costs no extra scan. Today it scans forward per statement-position brace, which is O(n × depth) in the worst case.
- Evaluation cost is controlled by the step budget, not by the source length alone. Large literals or repeated operations can dominate.
- Name lookup walks the enclosing scopes, so one lookup costs time proportional to block nesting. The nesting limit bounds that. A block with no bindings should not allocate a scope map.
- Each `if` and each `match` arm copies every open frame before it runs (see [docs/architecture-risks.md](docs/architecture-risks.md)). A program with many open slots and many conditionals spends its time copying, not computing.
- Error construction should be lazy: do not build excerpts or messages on the success path.
