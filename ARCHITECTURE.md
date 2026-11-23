# Tuff Architecture

This document describes the target architecture for Tuff, a small expression
language interpreter. It is the reference for how the code should be organized
as the language grows. It describes the ideal, not the current code.

## Definitions

### Source, names, and values

- **Tuff source**: a string written by a user or a program. It is untrusted.
- **Number**: a decimal literal made of ASCII digits. Values use IEEE-754 double
  precision, the same as JavaScript `number`.
- **Name**: a run of ASCII letters and `_`. `let` is reserved and cannot be a
  name.
- **Factor**: a number, a name, or a grouped expression `( expression )` or a
  block `{ sequence }`. A sign is never written directly before a factor; a sign
  is part of an expression.
- **Sequence**: zero or more statements, then one expression. A statement is
  `let [mut] name = expression ;` or `name = expression ;`. The sequence
  evaluates to its final expression. A `let` name is visible to the rest of its
  sequence, and a name may be declared only once per sequence. Names are not
  visible after the block that declares them closes.
- **Mutability**: a name declared with `let` is fixed. Only a name declared with
  `let mut` may be reassigned. Assigning to a fixed name, or to an undeclared
  name, is an error. An assignment inside a block to an enclosing `let mut` name
  persists after the block closes. A `let` in the block that shadows the name
  is not affected.
- **Scope**: the variables visible at one point of the source. A scope holds
  every visible name with its value and mutability, and the set of names the
  current block declared itself. Declaring or assigning a name returns a new
  scope; it never mutates one. Closing a block keeps the enclosing scope's names,
  with assignments from the block applied, except names the block declared.

### Evaluation

- **Term**: one or more factors joined by `*`. A term evaluates to the product
  of its factors.
- **Expression**: an optional leading sign, then one or more terms joined by
  `+` or `-`. An expression evaluates to the sum of its signed terms.
- **Grouping**: parentheses change precedence. Braces group a sequence, so their
  lets stay inside them. `(2 + 3) * 4` and `{ let x = 2 + 3; x } * 4` are both 20. Groups nest freely, but each opener must close with its own kind: `( 2 }`
  is an error. Empty groups `()` and `{}` are errors.
- **Precedence**: `*` binds tighter than `+` and `-`. Evaluation is left to
  right within each level.
- **Token**: a classified piece of source (number, name, `let`, `=`, `;`, `+`,
  `-`, `*`, `(`, `)`, `{`, `}`, or whitespace). Whitespace is dropped after
  tokenizing.
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
   `no-restricted-syntax`). Build a new array with spread instead. The cost of
   this rule is noted in Performance; see Future Work for how it is resolved.

## Structure

Target layout:

```
index.ts                 public entry point; re-exports interpretTuff
src/errors.ts            TuffError type and its variants
src/result.ts            Result type and helpers (ok, err)
src/scope.ts             Scope: rootScope, emptyScopeIn, declare, lookup
src/tokenize.ts          string -> Result<Token[], TuffError>
src/evaluate.ts          Token[] -> Result<number, TuffError>; starts the parser
src/parse/factor.ts      number, name, and group; the only file that calls group
src/parse/group.ts       "( expression )" and "{ sequence }"
src/parse/sequence.ts    let statements, then an expression
src/parse/expression.ts  signs, "+" and "-"
src/parse/term.ts        "*"
```

Dependency direction (arrows mean "imports from"):

```
index.ts -> evaluate.ts -> tokenize.ts -> errors.ts
                       \-> parse/factor.ts -> parse/group.ts
                                           -> parse/sequence.ts -> parse/expression.ts -> parse/term.ts
                       \-> scope.ts
result.ts and errors.ts are imported by all of the above.
```

Rules:

- No cycles between files. `result.ts`, `errors.ts`, and `scope.ts` import
  nothing from the project.
- The tokenizer knows nothing about precedence. The evaluator knows nothing
  about characters.
- Each stage takes plain data in and returns a `Result`. No stage holds state
  between calls.
- The parser files below `factor.ts` never import `factor.ts`. The factor
  parser is passed to them as a parameter (see Recursion). Only `factor.ts`
  imports `group.ts`, so the file graph stays acyclic.

### Recursion

The grammar is recursive because of parentheses and braces (factor -> group ->
sequence or expression -> term -> factor). The target parser must not use
recursion that spans files:

- The preferred target is a non-recursive parser (for example shunting-yard, or
  recursive descent with an explicit stack). This removes the call-stack limit
  and any mutual recursion.
- Until then, the cycle is broken by parameter passing. The factor parser has
  the type `(tokens, index, scope, end) => Result<Parsed>`. `term`, `expression`,
  `sequence`, and `group` each take it as a parameter and pass it on to the
  next stage. Only `factor.ts` supplies the real function. Of two mutually
  calling functions, one is passed as a parameter instead of being imported.
- Self-recursion inside one function (for example a `let` sequence that calls
  itself for its tail) is allowed, because it does not cross a file boundary.
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

Target shape: a discriminated union on a `kind` field, one variant per rule.
Each variant carries an `offset` and only the fields its message needs.

Variants (initial set, with the variants added for names and let):

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
- `UnexpectedSemicolon { offset }`: a `;` that does not end a let statement.
- `MissingSemicolon { offset, name }`: a let value is not followed by `;`.

Names, assignments, and scope:

- `MissingName { offset }`: `let` is not followed by a name.
- `MissingEquals { offset, name }`: a let name is not followed by `=`.
- `DuplicateVariable { offset, name }`: a name is declared twice in one
  sequence.
- `UndefinedVariable { offset, name }`: a name is used or assigned where no
  enclosing block declares it.
- `ImmutableAssignment { offset, name }`: a name declared with `let` (not
  `let mut`) is assigned.
- `UnexpectedEquals { offset }`: a `=` that does not follow a name in a let
  statement or an assignment.
- `UnmatchedBracket { offset, symbol }`: an opener with no closer, or a closer
  with no opener. `symbol` is one of `(`, `)`, `{`, `}`.
- `MismatchedBracket { offset, opener, openerOffset }`: a closer that does not
  match the innermost open group, for example `( 2 }`. `opener` is the
  innermost opening symbol and `openerOffset` is where it sits.
- `NestingTooDeep { offset, limit }`: parentheses nest beyond the depth
  limit.

Error messages are built from the variant. They never echo unbounded source
text. A name carried in a variant is shown only after truncation to a fixed
maximum length, so a long name in the source cannot make an error message long.

## Potential Problems

- **Stack exhaustion.** Nested parentheses recurse once per level, and the
  parser's call stack is the only limit. Around 10,000 nested `(` the current
  parser throws a `RangeError` from `interpretTuff`, which breaks the
  no-exceptions rule. Depth must be limited and reported as `NestingTooDeep`.
- **Quadratic tokenizing.** Invariant 7 forces each token to be appended with a
  spread, which copies the whole array. Tokenizing is therefore O(n^2) in the
  number of tokens. A 20,000-term source takes over a second.
- **Unbounded names in messages.** Undefined-variable, duplicate-variable, and
  missing-`=` messages echo the full name. A 5,000-character name produces a
  5,000-character error message.
- **Precision.** Large integer literals lose precision as doubles. Results
  that overflow become `Infinity` without an error.
- **Parse and evaluate are fused.** The parser computes values as it reads, so
  there is no syntax tree. This keeps the code small, but it means every rule
  about evaluation is tied to the grammar code, and a later feature that needs
  the tree (for example, reporting an error after evaluation) would require a
  rewrite.
- **Unbounded input.** There is no length limit. A very long source string
  costs time and memory, which should be bounded before Tuff accepts input from
  a network or a model.

## Security Concerns

Trust boundary: Tuff source is untrusted input. Today it is passed in by
callers in the same process. Later it may come from users, files, or a
language model.

What untrusted input can reach:

- The tokenizer and evaluator only. Source text must never reach `eval`,
  `Function`, a shell, the file system, or the network.

Controls the architecture should have:

| Control                                        | Status                             |
| ---------------------------------------------- | ---------------------------------- |
| No dynamic code execution (`eval`, `Function`) | Present                            |
| Malformed input is rejected, not coerced       | Present for the rules in Errors    |
| Input length limit                             | Missing                            |
| Non-finite results are reported as errors      | Missing                            |
| Error messages do not echo unbounded input     | Missing (names are echoed in full) |
| Nesting depth limit (no stack exhaustion)      | Missing (see Potential Problems)   |

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

- Split the parser into the files in Structure.
- Replace the fused parse-and-evaluate pass with a parser that produces a tree,
  then an evaluator that walks it. The tree is the seam that lets later
  features (type checks, more error kinds) be added without touching the
  grammar code.
- Make the parser non-recursive, following the Recursion section.
- Report an unmatched opener as `UnmatchedBracket` before parsing the group's
  contents, not after.
- Add a nesting depth limit that returns `NestingTooDeep`.
- Make tokenizing linear. Decide how a linear builder fits invariant 7, for
  example a local buffer owned by one function and returned as `readonly`, and
  state that decision in Invariants.
- Truncate names in error messages to a fixed maximum length.
- Add tests for every error variant, with one test per rule violated.
- Add a length limit on source input.

## Performance

These are obvious concerns only. Measure with a profiler before optimizing.

- Tokenizing is O(n^2) in the number of tokens because of the spread-based
  append (see Potential Problems). This is the first thing to fix.
- Each `let` copies its scope's name map, so a sequence with k lets copies
  O(k^2) entries. Fine for expected inputs.
- Variable lookup walks the scope chain, one step per enclosing block. Fine for
  expected inputs.
- String concatenation while building digits is linear in the number of
  digits. This is fine for expected inputs.
- Deeply nested parentheses use one stack frame per level. Enforce the
  nesting depth limit (see Recursion) so input cannot exhaust the stack.
