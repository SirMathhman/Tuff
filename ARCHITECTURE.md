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
- **Reference**: `&x` (shared) or `&mut x` (mutable) produces a live pointer to the slot of a binding. `*e` reads the value that the reference `e` points to, where `e` is any factor (a name, a parenthesized expression, or another `*`). `*e = value;` writes through the reference that `e` yields. The reference being written through must be `&mut` on a `let mut` binding; a shared reference earlier on the path, such as the `z` in `*(*z) = 1`, does not block the write. A reference may not leave the block that declares its binding (`ReferenceEscapes`), and it is not a number, so using one as an arithmetic operand is `ReferenceAsValue`.
- **Block**: a sequence of zero or more statements (`let` and assignment) followed by an optional final expression, optionally wrapped in `{ }`. A braced block must end in a final expression: `{ }` and `{ let x = 0; }` are `UnexpectedToken` errors at the closing brace. A source with statements but no final expression evaluates to 0, and an empty source is an error. The whole source is a block without braces. A block is the only construct that creates a scope.
- **Binding**: `let NAME = expr;` or `let mut NAME = expr;`. It introduces a name for the rest of its block. Only a `let mut` binding may be changed later; assigning a plain `let` binding is `ImmutableAssignment`.
- **Assignment**: `NAME = expr;`. It changes the value of a `let mut` binding, found by the same lookup as a read, so a nested block may assign a `mut` binding of an enclosing block. The right-hand side is evaluated before the name exists, so `let x = x;` refers to an outer `x` or fails with `UnknownName`.
- **Scope**: the lexical environment of one block: its bindings plus a link to the enclosing scope. Lookup walks outward and stops at the first match. A scope exists only while its block is being evaluated.
- **Invariant 1**: the same source always yields the same `Result`. There is no hidden state between calls.
- **Invariant 2**: evaluation always terminates or returns a `TuffError` for resource exhaustion. It never hangs the caller.
- **Invariant 3**: a module under `src/` never imports from `index.ts`.
- **Invariant 4**: a name is bound at most once per block (`DuplicateName`). A nested block may shadow an outer name. Every name used must resolve to a binding in scope (`UnknownName`). Both are static errors: decided from the source before any value is computed.
- **Invariant 5**: errors are reported in phase order. Lexical, syntax, and duplicate-name errors come first. Then the static name errors (`UnknownName`, `ImmutableAssignment`), in source order. Then evaluation errors (`DivisionByZero`, `NumericOverflow`, `BooleanOperand`, `TypeMismatch`, `NotAReference`, `ReferenceAsValue`, `ReferenceEscapes`, and `ImmutableAssignment` for a write through a shared reference), including the overflow of a numeric literal, which is checked when the literal is evaluated, not when it is parsed. Within one operator, an error in the left operand is reported before one in the right operand, and both before the operator's own error. The reported error depends only on the source, never on runtime state. For example, `1 / 0 + x` reports `UnknownName`, and `true + 1 / 0` reports `DivisionByZero`.
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
  ast.ts            AST node types (no logic): literals, names, chains, blocks, let and assign statements
  scope.ts          Scope type, creation, and name lookup; Frame (the runtime slots of one open block); NameRef and NameRefs (the resolver's output). No evaluation
  value.ts          Value (number, boolean, or Reference) and Reference (a live pointer to one frame slot). Types and guards only
  resolver.ts       AST -> Result<void, TuffError>: checks every name is bound. Computes no values
  evaluator.ts      AST -> value: walks blocks, creates scopes, applies operators, enforces limits
  limits.ts         configurable limits (max depth, max steps, max source length)
```

Dependency direction (arrows mean "may import"):

```
index.ts       -> lexer.ts, parser.ts, resolver.ts, evaluator.ts, errors.ts, result.ts (evaluateTuff composes the stages; re-exports the public types)
evaluator.ts   -> ast.ts, scope.ts, value.ts, errors.ts, result.ts (limits.ts once it exists)
value.ts       -> scope.ts (for the Frame type)
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
- `NameRef` and `NameRefs` are defined in `scope.ts`, not in `resolver.ts`. The resolver writes them and the evaluator reads them, so the evaluator never imports the resolver. The resolver and evaluator both use `scope.ts` for block-level name slots; there is one definition of a slot, not one per stage.
- The parser must not evaluate and must not look up names. Its output is a syntactically valid AST and nothing more.
- Recursion is allowed only inside the parser, resolver, and evaluator, and only over the AST. Mutual recursion between functions in different files is forbidden. Where two functions must call each other, pass one as a parameter.
- Limits: 100 lines per function, 500 code lines per file, 10 files per directory. These must be enforced by lint (see Future Work). Lint does not enforce them yet.

## Risks, Security, and Future Work

See [docs/architecture-risks.md](docs/architecture-risks.md) for potential problems, security concerns, and future work.

4. Define a host-capability interface before any feature needs I/O.

## Performance

Obvious concerns only; profile before optimizing.

- Lexing and parsing are linear in source length and should stay that way. Avoid re-scanning the input for each token.
- Evaluation cost is controlled by the step budget, not by the source length alone. Large literals or repeated operations can dominate.
- Name lookup walks the enclosing scopes, so one lookup costs time proportional to block nesting. The nesting limit bounds that. A block with no bindings should not allocate a scope map.
- Error construction should be lazy: do not build excerpts or messages on the success path.
