# Architecture

Tuff is a small TypeScript interpreter run with [Bun](https://bun.com). It evaluates `let` and assignment statements followed by one expression.

## Definitions

### Grammar

Terms are joined by `+` or `-`. A term is factors joined by `*` or `/`, which bind tighter. `/` truncates toward zero, and a zero divisor is always an error. A factor is a sign, then an integer, `true` or `false`, a variable, `*name`, `NAME()` (a call), a bracketed expression, or an `if`. `fn NAME() => e;` declares a parameterless function. Functions are hoisted within open scopes, and the body is checked (lenient) when its block ends, then parsed at each call. A braced body needs no `;`; if it ends in an assignment, the call is 0. A statement-start call may end with `;`, discarding its value. `if (c) a else b` has a boolean condition and one-factor branches. A statement-level braced `if` may omit `else`; a body ending in a statement is an error when `else` follows. A boolean cannot be an operand of arithmetic or take a sign. Comparisons bind loosest; they do not chain.

### Statements and scope

`let [mut] NAME = expression;` binds an ASCII name; `let` is reserved. `NAME = expression;` and `NAME op= expression;` (`op` is `+ - * /`) reassign a `let mut` name at a statement start, keeping its type. A block's value is its final expression, unless a top-level block ends in an assignment (discarded). A program ending in `let` is 0. `while (c) { b }` repeats `b` while boolean `c` holds.

### References

`let y = &x;` binds `y` to the cell of `x`, so `*y` reads `x`. `let y = &mut x;` (`x` must be `let mut`) also allows `*y = v;`, and a `&mut` cannot overlap another reference to `x`. A reference cannot be `let mut`, reassigned, read without `*`, or pointed at another reference. `&` is valid only as the whole value of a `let`, or as the last item of a braced block or if-branch that is one; its target must be outside the block.

### Lenient branches

The unchosen branch of an `if` is parsed for syntax only: its errors are reported, but its assignments have no effect.

### Results and errors

Results are `{ ok: true, value }` or `{ ok: false, error }`. A boolean program result converts to 1 or 0. `TuffError` has `what`, `where` (a zero-based offset), `why`, and `fix`. A `fix` is an edit the grammar allows.

## Structure

### Source files

- `src/scanner.ts`: character classes, token readers, and `Operator`.
- `src/errors.ts`: `TuffError`, `Result`, `Bracket`, and error constructors.
- `src/types.ts`: parser state, stack entry types, and `Cell`.
- `src/operations.ts`: operator meaning, sign application, and reduction.
- `src/parse/`: `helpers.ts` (shared lookups and transitions), `operands.ts` (with `*`), `operators.ts`, `references.ts` (`&`), and `calls.ts` (`fn`).
- `src/index.ts`: `interpretTuff`. `src/repl.ts`: stdin REPL (`bun run repl`).
- `src/test/*.test.ts`: `bun:test` suites. `test-messages.ts` holds shared messages.

### Dependency direction

`errors.ts` depends on nothing and owns `Bracket`. `scanner.ts` depends on `errors.ts`. `types.ts` depends on `errors.ts` and `scanner.ts`. `operations.ts` depends on `errors.ts`, `scanner.ts`, `types.ts`. In `src/parse/`, steps depend on `helpers.ts`, `references.ts` and `operations.ts`, `references.ts` depends on `helpers.ts`, and `helpers.ts` depends on `operations.ts`. `calls.ts` depends on `helpers.ts` and `operations.ts`, and `operands.ts` depends on `calls.ts`. `index.ts` depends on all of them. `repl.ts` and the tests depend on `index.ts`. Only `repl.ts` performs I/O. Import cycles between project files are not allowed.

### Implementation

`interpretTuff` is a single loop with explicit stacks and no recursion. Each step first runs `finishCalls`, which completes every finished call, then `startDeferredCheck`, which runs deferred body checks.

#### Stacks

Value, operator, and scope stacks, plus a skip counter for unchosen branches. A call pushes a `Call` entry, saving the caller's scopes, depth, return offset, value base, and flags. The callee sees its declaration's snapshot plus functions declared later in open scopes.

#### Precedence

Pending operators apply left-associatively. `)` and `}` apply pending operators back to their bracket, then the sign before it.

### Quality gates

Every change must pass `bun run lint`, `bun test`, `bun run format:check`, and `bunx tsc --noEmit`. `bun run cpd` checks duplicates. ESLint adds local, restricted-syntax, and `import-x/no-cycle` rules; `local/no-recursion` checks one file only.

#### Size and naming

Functions are capped at 100 lines, files at 500, and names need two characters. A directory may hold at most 10 files, subdirectories excluded (`scripts/max-files-per-dir.ts`). Exported declarations need JSDoc, and types they use must be exported.

## Potential Problems

### Shared parser state

Every parse step mutates one `ParserState`, so any step can touch any field.

### Call fan-out

Depth is capped at 100, and steps at 200,000. Each call reparses its body, so `n` levels of calls that each call an earlier function twice cost about 2^n parses. 18 levels exceed the step limit, which then rejects valid programs.

### Failure detection

Failures and values share a return type, told apart by `typeof === "object"`. This holds only while values are numbers and booleans.

### Numeric precision

Numbers are doubles, so large integers round silently (`9007199254740993 + 0` is `9007199254740992`), and overflow yields `Infinity` with no `TuffError`.

### Reference aliasing

A live `&mut` blocks reads and writes of its owner; any live reference blocks writes. `borrowedBy` scans visible scopes, so a body misses references declared after its function: `let mut x = 1; fn g() => x; let y = &mut x; g()` gives 1.

## Security Concerns

### Trust boundary

`interpretTuff` performs no I/O and takes only a string from its caller. The REPL, reading untrusted stdin, is the only path for untrusted text.

### Controls

Explicit stacks mean nesting costs memory, not JavaScript frames; open calls are capped at 100, and a program takes at most 200,000 steps. Future I/O goes behind a capability parameter.

### Gaps

The REPL reads each line with no length limit, and no maximum source length is enforced.

## Future Work

### Known gaps

Not implemented: `==` and `!=` on booleans, assignment outside statement starts, functions with parameters, and names with digits or underscores. Also missing: statement-level `if` with `else` whose braces end in assignments, REPL bindings across lines, and REPL output of `why` and `fix`.

### Call limits

Stop reparsing bodies on each call. Keep borrow state on the cell, as a list of live references, so checks do not depend on which scopes a body sees. Move calls to their own frame stack, apart from pending operators.

### Module names

Rename `operations.ts` to `reduce.ts`, which is too close to `operators.ts`. Split parse steps by statement, bracket, and `if`.

### Errors and data

Give `TuffError` a kind enum, so tests match kinds rather than message text. Split `errors.ts` (about 400 code lines) by category into a directory before it nears 500. Replace `number` with `bigint` or a decimal type, and report line and column in `where`. Build an AST, then evaluate it, so lenient branches become an evaluator concern.

## Performance

Variable access scans stacks and scopes. Call depth scans the operator stack; a counter would avoid that. Profile first.
