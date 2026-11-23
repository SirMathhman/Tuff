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
- **Boolean and operand**: a boolean is the keyword `true` or `false`. It is a
  plain value like a number, but not a number: it cannot take part in
  arithmetic. An operand is a number or a boolean, the plain values a variable
  or a factor can hold.
- **Factor**: a number, a boolean, a name, a dereference `*name`, or a grouped
  expression `( expression )` or a block `{ sequence }`. A sign is never
  written directly before a factor; a sign is part of an expression.
- **Sequence**: zero or more statements, then one expression. A statement is
  `let [mut] name = value ;`, `name = value ;`, or `*name = expression ;`. The
  sequence evaluates to its final expression. A `let` name is visible to the
  rest of its sequence, and a name may be declared only once per sequence. Names
  are not visible after the block that declares them closes.
- **Value**: what a `let` or an assignment stores. It is either an expression
  (an operand: a number or a boolean) or a reference: `&name` (read-only) or
  `&mut name` (mutable). A `let` may store a boolean, and a variable holding a
  boolean may be read as a whole value.
- **Reference**: a pointer to a variable's slot, not to its name. Reading `*name`
  yields the number the reference points at. Writing `*name = expression ;` is
  allowed only through a `&mut` reference. A reference to a boolean slot may be
  dereferenced only where the result is used as a whole value, not in arithmetic.
- **Variable, cell, and scope**: how declared variables are stored at runtime.
  See [docs/scope.md](docs/scope.md).
- **Mutability**: a name declared with `let` is fixed, and only a name declared
  with `let mut` may be reassigned. See [docs/scope.md](docs/scope.md).

### Evaluation

- **Term**: one or more factors joined by `*`. A term evaluates to the product
  of its factors.
- **Expression**: an optional leading sign, then one or more terms joined by
  `+` or `-`. An expression evaluates to the sum of its signed terms.
- **Boolean rules**: a single factor with no sign, no `*`, and no `+` or `-`
  keeps its value, so `true`, `false`, or a boolean variable can be a whole
  `let` value, an assignment value, or the final result. Any arithmetic (a
  sign, `*`, `+`, `-`, or a comparison) requires numbers; a boolean operand there is a
  `BooleanAsNumber` error.
- **Boundary coercion**: `interpretTuff` returns a number. A final boolean
  value is returned as `1` for `true` and `0` for `false`. This is the only
  place a boolean becomes a number; no inner stage coerces.
- **Logical operators**: `||` joins `&&` groups, and `&&` joins comparisons.
  Both operators take booleans only: a number on either side is a
  `NumberAsBoolean` error. The result is a boolean. `&&` binds tighter than
  `||`, and both bind looser than the comparisons (see Precedence), so
  `true || false && false` is `true`. The right side is skipped when the left side decides the result
  (`false &&`, `true ||`). A skipped side's assignments are discarded, but its
  errors are still reported.
- **Grouping**: parentheses change precedence. Braces group a sequence, so their
  lets stay inside them. `(2 + 3) * 4` and `{ let x = 2 + 3; x } * 4` are both 20. Groups nest freely, but each opener must close with its own kind: `( 2 }`
  is an error. Empty groups `()` and `{}` are errors.
- **Precedence**, tightest first: `*`, then `+` and `-`, then the comparisons
  `<`, `>`, `<=`, `>=`, `==`, and `!=`, then `&&`, then `||`. Evaluation is left
  to right within each level. A comparison takes two numbers (`BooleanAsNumber`
  otherwise) and gives a boolean. A second comparison operator in one comparison
  is a `ChainedComparison` error, so `1 < 2 < 3` is rejected. Comparisons
  are exact: `==` and `!=` compare the double values, so they do not treat
  nearby values as equal.
- **Token**: a classified piece of source (number, name, `let`, `mut`, `true`,
  `false`, `=`, `;`, `&`, `&&`, `||`, `<`, `>`, `<=`, `>=`, `==`, `!=`, `+`,
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
   accepted or coerced to a number. The only coercion is the boundary coercion
   in Evaluation: a final boolean is returned as `1` or `0`.
3. No `eval`, `Function`, or dynamic code execution, ever.
4. No regex literals (enforced by ESLint `no-restricted-syntax`). Use string
   methods and character comparisons.
5. Functions are declared with `function` declarations (ESLint `func-style`).
6. Parameters never accept `undefined` in a union (ESLint `no-restricted-syntax`).
   A helper that may run past the end of a list takes the list and an index,
   and reads the token itself. Helpers that receive a token take a definite
   `Token`. This keeps the "end of input" case in one place.
7. Arrays are immutable. `Array.prototype.push` is banned (ESLint
   `no-restricted-syntax`). Build a new array with spread instead. One exception:
   `tokenize` collects tokens in a local buffer that it writes by index only and
   returns (as a copy) once complete. No other code sees the buffer, so the
   tokenizer is linear.
8. A reference never outlives the block that declares its target. When a block
   closes, any enclosing variable that holds a reference to one of the block's
   own variables is an error (`ReferenceEscapesBlock`). Slots of closed blocks
   are never read through a live name.
9. A reference points at a variable slot. Dereferencing reads or writes that
   slot and never copies the reference itself. A reference to a reference cannot
   be read as a number.

## Structure

Target layout:

```
index.ts                 public entry point; re-exports interpretTuff
src/errors.ts            TuffError type and the builders for each error message
src/result.ts            Result type and helpers (ok, err)
src/scope.ts             Scope, Variable, Reference, Value; rootScope, childScope,
                         declare, setCell, closeScope, findEscape
src/tokenize.ts          string -> Result<Token[], TuffError>; token types and helpers
src/evaluate.ts          string -> Result<number, TuffError>; checks nesting, then parses
src/parse/types.ts       Parsed, Evaluated, Parser, ParseResult
src/parse/factor.ts      number, boolean, name, and group; the only file that calls group
src/parse/deref.ts       "*name" read through a reference (a factor)
src/parse/group.ts       "( expression )" and "{ sequence }"
src/parse/sequence.ts    let, assignment, and "*name =" statements, then an
                         expression
src/parse/value.ts       a let or assignment value: "&name", "&mut name", or an
                         expression
src/parse/expression.ts  signs, "+", "-", comparisons, "&&", and "||"
src/parse/term.ts        "*"
```

Dependency direction (arrows mean "imports from"):

```
index.ts            -> evaluate.ts
evaluate.ts         -> tokenize.ts, scope.ts, parse/factor.ts, parse/sequence.ts
parse/factor.ts     -> parse/group.ts, parse/deref.ts
parse/group.ts      -> parse/sequence.ts, parse/expression.ts, scope.ts
parse/sequence.ts   -> parse/value.ts, parse/expression.ts, scope.ts
parse/value.ts      -> parse/expression.ts
parse/expression.ts -> parse/term.ts
parse/deref.ts, parse/term.ts -> no parser files
parse/types.ts is imported by every parse file. result.ts and errors.ts are
imported by all of the above.
```

Rules:

- No file exceeds 1000 lines, not counting blank and comment lines. ESLint
  `max-lines` enforces this. Each file in the layout above stays well under it.
- No cycles between files. `result.ts`, `errors.ts`, and `scope.ts` import
  nothing from the project. `deref.ts` reads the scope and imports no parser.
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
  `sequence.ts` may also recurse among its own statement parsers.
- Recursion depth is bounded. Input that nests too deeply is reported as a
  `TuffError`, never as a thrown `RangeError`. Bracket nesting is bounded by
  `NestingTooDeep`; the number of statements is not yet bounded (see Future
  Work).

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
- `BooleanAsNumber { offset, text }`: a `true` or `false` operand used in
  arithmetic or a comparison (a sign, `*`, `+`, `-`, or a comparison). `text` is the
  boolean's spelling.
- `NumberAsBoolean { offset, symbol }`: a number used as an operand of `||` or
  `&&`. `symbol` is the operator.
- `MissingNumber { offset }`: a number is required but the source ends, or
  an operator or `)` is found. Covers `2 *`, `2 * + 3`, and `()`.
- `MissingOperator { offset }`: two numbers or groups are adjacent with no
  operator between them, for example `2 3`, `2 (3)`, or `(2) 3`.
- `UnexpectedSemicolon { offset }`: a `;` that does not end a let statement.
- `MissingSemicolon { offset, name }`: a let value is not followed by `;`.

Comparison:

- `ChainedComparison { offset, first, second }`: a second comparison operator
  follows a comparison, for example `1 < 2 < 3` or `1 == 1 == 1`. `offset` is
  the second operator; `first` and `second` are the two operators as spelled.

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
- `NestingTooDeep { offset, limit }`: parentheses and braces nest beyond the
  depth limit.

References:

- `ReferenceAsNumber { offset, name }`: a variable that holds a reference is
  used where a number is required.
- `NotAReference { offset, name }`: `*name` or `*name = ...` where `name` does
  not hold a reference.
- `ReadOnlyReference { offset, name }`: `*name = ...` through a `&` reference.
- `CannotBorrowMutably { offset, name }`: `&mut name` where `name` is not
  `let mut`.
- `ReferenceEscapesBlock { offset, name }`: an enclosing variable would refer
  to a variable that ends with the block. `offset` is the closing brace.

Error messages are built from the variant. They never echo unbounded source
text. A name carried in a variant is shown only after truncation to a fixed
maximum length, so a long name in the source cannot make an error message long.

## Potential Problems

- **Stack exhaustion from statements.** Each `let` or assignment recurses into
  the sequence parser once. A sequence of very many statements grows the call
  stack with no depth bound and no `TuffError`, which can end in a thrown
  `RangeError`. Bracket depth is limited, but statement count is not.
- **Quadratic scope copying.** Each `let` copies the scope tables (see
  Performance). With the 10,000-character source limit, this stays within a few
  seconds, but it is still O(k^2) in the number of statements.
- **Unbounded names in messages.** Undefined-variable, duplicate-variable, and
  missing-`=` messages echo the full name. A 5,000-character name produces a
  5,000-character error message.
- **Precision.** Large integer literals lose precision as doubles. Results
  that overflow become `Infinity` without an error. Comparisons inherit this:
  two distinct integers above 2^53 can compare equal under `==`.
- **Boolean comparison.** A comparison requires numbers, so `true == true` is
  a `BooleanAsNumber` error, not `true`. Users may expect equality on booleans.
  Extending `==` and `!=` to booleans is a grammar decision, not a parser fix.
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
| Input length limit                             | Present (10,000 characters)        |
| Non-finite results are reported as errors      | Missing                            |
| Error messages do not echo unbounded input     | Missing (names are echoed in full) |
| Nesting depth limit for brackets               | Present                            |
| Bounded statement count (no stack exhaustion)  | Missing (see Potential Problems)   |
| A reference cannot outlive its target          | Present                            |

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
- Make the parser non-recursive, following the Recursion section. This also
  bounds the stack for long sequences of statements.
- Report an unmatched opener as `UnmatchedBracket` before parsing the group's
  contents, not after.
- Truncate names in error messages to a fixed maximum length.
- Add tests for every error variant, with one test per rule violated.

## Performance

These are obvious concerns only. Measure with a profiler before optimizing.

- Tokenizing is linear (see invariant 7). Source is capped at 10,000 characters.
- Each `let` or assignment copies the scope's name map, own-name set, and cell
  table, so a sequence with k statements copies O(k^2) entries. The source cap
  bounds this; it is the main remaining cost.
- Variable lookup walks the scope chain, one step per enclosing block. Fine for
  expected inputs.
- String concatenation while building digits is linear in the number of
  digits. This is fine for expected inputs.
- Deeply nested brackets use several stack frames per level. The depth limit
  (see Recursion) keeps this bounded; statement count is not yet bounded.
