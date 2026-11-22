# Tuff Architecture

This document describes the target architecture for Tuff, a small expression
language interpreter. It is the reference for how the code should be organized
as the language grows. It describes the ideal, not the current code.

## Definitions

- **Tuff source**: a string written by a user or a program. It is untrusted.
- **Number**: a decimal literal made of ASCII digits. Values use IEEE-754 double
  precision, the same as JavaScript `number`.
- **Factor**: a number, optionally preceded by a sign.
- **Term**: one or more factors joined by `*`. A term evaluates to the product
  of its factors.
- **Expression**: one or more terms joined by `+` or `-`. An expression
  evaluates to the sum of its signed terms.
- **Precedence**: `*` binds tighter than `+` and `-`. Evaluation is left to
  right within each level.
- **Token**: a classified piece of source (number, `+`, `-`, `*`, or
  whitespace). Whitespace is dropped after tokenizing.
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

Current state: a single file, `index.ts`, with a one-pass character scanner
that keeps mutable state in closures. Precedence is handled by tracking a
pending product. This works for `+`, `-`, and `*`, but it cannot report
errors and it does not extend cleanly to new operators.

### Recursion

The planned grammar is flat (expression -> terms -> factors), so it can be
evaluated iteratively. If parentheses are added, the grammar becomes
recursive. In that case:

- Keep the recursion in a single function where possible.
- If two functions must call each other, pass one as a parameter instead of
  importing it. This keeps the file graph acyclic.

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

Error messages are built from the variant. They never echo unbounded source
text.

## Potential Problems

- **Silent acceptance of malformed input.** The current scanner returns a
  number for `2 *` (2), `2 * + 3` (6), `2 * * 3` (6), and `2 - * 3` (-1).
  These should be `TuffError`s. This is the most important known defect.
- **Adjacent numbers.** `2 3` currently evaluates to 5. The rule for
  whitespace-separated numbers is not defined. It must either be an error or
  a documented feature.
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
| Error messages do not echo unbounded input | Missing (no errors yet) |

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
- Define the whitespace-separated number rule (error or feature) and document
  it here.
- Add tests for every error variant, with one test per rule violated.
- Add parentheses, following the recursion guidance above.
- Add a length limit on source input.

## Performance

These are obvious concerns only. Measure with a profiler before optimizing.

- Tokenizing is linear in source length. This is fine for expected inputs.
- String concatenation while building digits is linear in the number of
  digits. This is fine for expected inputs.
- If parentheses are added, deeply nested input can exhaust the call stack.
  Enforce a nesting depth limit when that happens.
