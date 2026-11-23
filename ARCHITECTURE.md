# Tuff Architecture

This document describes the target architecture for Tuff, a small expression
language interpreter. It is the reference for how the code should be organized
as the language grows. It describes the ideal, not the current code.

## Definitions

- **Tuff source**: a string written by a user or a program. It is untrusted.
- **Number**: a decimal literal made of ASCII digits. Values use IEEE-754 double
  precision, the same as JavaScript `number`.
- **Factor**: a number, or a grouped expression `( expression )` or
  `{ expression }`. A sign is never written directly before a factor; a sign is
  part of an expression.
- **Term**: one or more factors joined by `*`. A term evaluates to the product
  of its factors.
- **Expression**: an optional leading sign, then one or more terms joined by
  `+` or `-`. An expression evaluates to the sum of its signed terms.
- **Grouping**: parentheses and braces change precedence. `(2 + 3) * 4` and
  `{ 2 + 3 } * 4` are both 20. Groups nest freely, but each opener must close
  with its own kind: `( 2 }` is an error. Empty groups `()` and `{}` are errors.
- **Precedence**: `*` binds tighter than `+` and `-`. Evaluation is left to
  right within each level.
- **Token**: a classified piece of source (number, `+`, `-`, `*`, `(`, `)`, `{`,
  `}`, or whitespace). Whitespace is dropped after tokenizing.
- **TuffError**: a structured error value (see Errors below). Never a bare
  string.
- **Result**: `{ ok: true, value } | { ok: false, error }`. The only way a
  function reports failure.

Invariants:

1. `interpretTuff` is a pure function. Same source, same result. No I/O, no
   global state.
2. Malformed source is always reported as a `TuffError`. It is never silently
   accepted or coerced to a number.
3. No `eval`, `Function`, or dynamic code execution, ever.
4. No regex literals (enforced by ESLint `no-restricted-syntax`). Use string
   methods and character comparisons.
5. Functions are declared with `function` declarations (ESLint `func-style`).
6. Parameters never accept `undefined` in a union (ESLint `no-restricted-syntax`).
   A helper that may run past the end of a list takes the list and an index,
   and reads the token itself. Helpers that receive a token take a definite
   `Token`. This keeps the "end of input" case in one place.
7. Arrays are immutable. `Array.prototype.push` is banned (ESLint
   `no-restricted-syntax`). Build a new array with spread instead.

## Structure

Target layout:

```
index.ts            public entry point; re-exports interpretTuff
src/errors.ts       TuffError type and its variants
src/result.ts       Result type and helpers (ok, err)
src/tokenize.ts     string -> Result<Token[], TuffError>
src/evaluate.ts     Token[] -> Result<number, TuffError>
```

Dependency direction (arrows mean "imports from"):

```
index.ts -> evaluate.ts -> tokenize.ts -> errors.ts
                       \-> result.ts  <-  (used by all of the above)
```

Rules:

- No cycles between files. `result.ts` and `errors.ts` import nothing from the
  project.
- The tokenizer knows nothing about precedence. The evaluator knows nothing
  about characters.
- Each stage takes plain data in and returns a `Result`. No stage holds state
  between calls.

Current state: a single file, `index.ts`, with a tokenizer and a recursive
descent parser (expression, term, factor, group). It is not yet split into the
target files above; see Future Work.

### Recursion

The grammar is recursive because of parentheses (factor -> expression ->
term -> factor). The target parser must not use recursion that spans files:

- The target is a non-recursive parser (for example shunting-yard, or
  recursive descent with an explicit stack). This removes the call-stack
  limit and any mutual recursion, so the parser can be split across files
  freely.
- Until then, if two functions must call each other, pass one as a parameter
  instead of importing it. This keeps the file graph acyclic.
- Recursion depth is bounded. Input that nests too deeply is reported as a
  `TuffError`, never as a thrown `RangeError`.

## Errors

Errors are values, not exceptions. Every failure is a `TuffError` returned
inside a `Result`.

A `TuffError` must answer four questions:

1. What went wrong (the variant, for example `DanglingOperator`).
2. Where it happened (the zero-based character offset in the source).
3. Why it is an error (the variant and its fields explain the rule that was
   broken).
4. What the caller can do about it (the variant implies the fix: remove the
   operator, add a number, and so on).

Planned variants (initial set):

- `UnexpectedCharacter { offset, character }`
- `DanglingOperator { offset, operator }`: an operator with no operand
  before or after it, for example `2 *` or `2 * + 3`.
- `DoubleOperator { offset, first, second }`: two operators in a row, for
  example `2 - * 3`.
- `NumberOutOfRange { offset }`: a literal or intermediate result that is not
  finite.
- `MissingNumber { offset }`: a number is required but the source ends, or
  an operator or `)` is found. Covers `2 *`, `2 * + 3`, and `()`.
- `MissingOperator { offset }`: two numbers or groups are adjacent with no
  operator between them, for example `2 3`, `2 (3)`, or `(2) 3`.
- `UnmatchedParenthesis { offset, kind }`: a `(` with no `)`, or a `)` with
  no `(`. `kind` is `"open"` or `"close"`.
- `NestingTooDeep { offset, limit }`: parentheses nest beyond the depth
  limit.

Error messages are built from the variant. They never echo unbounded source
text.

## Potential Problems

- **Silent acceptance of malformed input.** The current scanner returns a
  number for `2 *` (2), `2 * + 3` (6), `2 * * 3` (6), and `2 - * 3` (-1).
  These should be `TuffError`s. This is the most important known defect.
- **Adjacent numbers.** Whitespace-separated numbers are an error
  (`MissingOperator`). Whitespace is never a multiplication.
- **Stack exhaustion.** Nested parentheses recurse once per level. Around
  10,000 nested `(` the current parser throws a `RangeError` from
  `interpretTuff`, which breaks the no-exceptions rule. Depth must be limited
  and reported as `NestingTooDeep`.
- **Precision.** Large integer literals lose precision as doubles. Results
  that overflow become `Infinity` without an error.
- **Scanner state coupling.** The closure-based scanner mixes tokenizing and
  evaluation. Adding a new operator or a new precedence level requires
  changing several interacting flags (`sign`, `afterStar`, `term`).
- **Unbounded input.** There is no length limit. A very long source string
  costs linear time and memory, which is acceptable now but should be
  bounded before Tuff accepts input from a network or a model.

## Security Concerns

Trust boundary: Tuff source is untrusted input. Today it is passed in by
callers in the same process. Later it may come from users, files, or a
language model.

What untrusted input can reach:

- The tokenizer and evaluator only. Source text must never reach `eval`,
  `Function`, a shell, the file system, or the network.

Controls the architecture should have:

| Control | Status |
| --- | --- |
| No dynamic code execution (`eval`, `Function`) | Present |
| Malformed input is rejected, not coerced | Missing (see Potential Problems) |
| Input length limit | Missing |
| Non-finite results are reported as errors | Missing |
| Error messages do not echo unbounded input | Present (messages echo one character at most) |
| Nesting depth limit (no stack exhaustion) | Missing (see Potential Problems) |

Prompt injection: if Tuff source is ever produced by a language model, treat
the model output as untrusted text. The interpreter stays a pure evaluator.
It must not gain tools, file access, or side effects, so a malicious
expression can at worst produce a wrong number or an error.

Data exposure: none today. If Tuff gains variables or host functions, they
must be passed in explicitly. The interpreter must not read ambient
environment state.

Unauthenticated state changes: none. The interpreter is a pure function and
performs no state changes.

## Future Work

- Replace the single-pass scanner with the tokenize-then-evaluate pipeline
  described in Structure.
- Return `Result<number, TuffError>` from `interpretTuff`. Update callers and
  tests together.
- Make the parser non-recursive, following the Recursion section.
- Report unmatched `(` as `UnmatchedParenthesis` before parsing the group's
  contents, not as `MissingNumber`.
- Add a nesting depth limit that returns `NestingTooDeep`.
- Add tests for every error variant, with one test per rule violated.
- Add a length limit on source input.

## Performance

These are obvious concerns only. Measure with a profiler before optimizing.

- Tokenizing is linear in source length. This is fine for expected inputs.
- String concatenation while building digits is linear in the number of
  digits. This is fine for expected inputs.
- Deeply nested parentheses use one stack frame per level. Enforce the
  nesting depth limit (see Recursion) so input cannot exhaust the stack.
