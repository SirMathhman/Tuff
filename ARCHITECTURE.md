# Architecture

Tuff is a small TypeScript interpreter run with [Bun](https://bun.com).

## Definitions

### Grammar

Terms are joined by `+` or `-`. A term is factors joined by `*` or `/`, which bind tighter. Two terms may be joined by one comparison (`<`, `<=`, `>`, `>=`, `==`, `!=`), which yields a boolean; comparisons do not chain. `/` truncates toward zero; a zero divisor is an error. A factor is a sign, then an integer, `true` or `false`, a variable, `*name`, `NAME()`, `NAME[e]`, a bracketed expression, an `if`, or `match (v) { case L => e; }`, which takes the first matching case (`case _` must be last), or is an error at `match` if none matches. `fn NAME() => e;` declares a parameterless function. Functions are hoisted within open scopes and parsed per call, after a lenient check at block end. A braced body needs no `;`; ending in an assignment makes the call 0. `if (c) a else b` has a boolean condition and one-factor branches. A statement-level braced `if` may omit `else`; a body ending in a statement is an error when `else` follows. A boolean takes no arithmetic or sign.

### Statements and scope

`let [mut] NAME = expression;` binds an ASCII name; `let` is reserved. `let a = [e, ...];` makes an array (nesting allowed), and `let b = a;` moves it; `a[i] = v;` sets an element of a `let mut` array. `NAME = expression;` and `NAME op= expression;` reassign a `let mut` name at a statement start, keeping its type. A block's value is its final expression, unless a top-level block ends in an assignment (discarded). A program ending in `let` is 0. `while (c) { b }` repeats `b` while boolean `c` holds. It has no value, so a block cannot end in it.

### References

`let y = &x;` binds `y` to the cell of `x`, so `*y` reads `x`. `let y = &mut x;` (`x` must be `let mut`) also allows `*y = v;`, and a `&mut` cannot overlap another reference to `x`. A reference cannot be `let mut`, reassigned, read without `*`, or pointed at another reference. `&` is valid only as the whole value of a `let`, or as the last item of a braced block or if-branch that is one; its target must be outside the block.

### Lenient branches

Unchosen `if` branches and unchosen `match` cases are parsed for syntax only: errors are reported, assignments have no effect.

### Results and errors

Results are `{ ok: true, value }` or `{ ok: false, error }`. A boolean program result converts to 1 or 0. `TuffError` has `what`, `where` (a zero-based offset), `why`, and `fix`. A `fix` is an edit the grammar allows.

## Structure

### Source files

- `src/scanner.ts`: character classes, token readers, bracket matching, and `Operator`.
- `src/code.ts`: compiled expressions, not yet used by `interpretTuff`.
- `src/errors/`: `core.ts` (types), and constructors by family, re-exported by `index.ts`.
- `src/types.ts`: parser state, stack entry types, and `Cell`.
- `src/operations.ts`: operator meaning, sign application, and reduction.
- `src/parse/`: `helpers.ts`, `operands.ts` (with `*`), `operators.ts`, `references.ts` (`&`), `calls.ts` (`fn`), `loops.ts` (`while`), `matches.ts` (`match`, `case`), and `arrays.ts` (literals, `[e]`, element assignment).
- `src/index.ts`: `interpretTuff`. `src/repl.ts`: stdin REPL (`bun run repl`).
- `src/test/`: `bun:test` suites and shared messages.

### Dependency direction

`errors/` depends on nothing outside itself, and `core.ts` owns `Bracket`. `scanner.ts` depends on `errors/` and owns bracket matching. `types.ts` depends on both. `operations.ts` depends on `errors/`, `scanner.ts`, `types.ts`. In `src/parse/`, `helpers.ts` depends on `operations.ts`. `references.ts`, `calls.ts`, `loops.ts`, `matches.ts`, and `arrays.ts` depend on `helpers.ts` and `operations.ts`, never on each other. `operands.ts` depends on those five, and `operators.ts` depends on `loops.ts`, `matches.ts`, and `arrays.ts`. `index.ts` depends on all of them. `repl.ts` and the tests depend on `index.ts`. Only `repl.ts` performs I/O. Import cycles between project files are not allowed.

### Implementation

`interpretTuff` is one loop over explicit stacks, with no recursion.

#### Stacks

Value, operator, and scope stacks, plus a skip counter for unchosen branches. A `while`, `match`, array literal, or index pushes its own entry on the operator stack. A call pushes a `Call` entry that saves the caller's state. A callee sees its declaration's snapshot and later open-scope functions.

#### Precedence

Pending operators apply left-associatively. `)` and `}` apply pending operators back to their bracket, then the sign before it.

### Quality gates

Every change must pass `bun run lint`, `bun test`, `bun run format:check`, and `bunx tsc --noEmit`. ESLint enforces `import-x/no-cycle`, and `local/no-recursion` checks one file only.

#### Size and naming

Functions are capped at 100 lines, files at 500, and names need two characters. A directory may hold at most 10 files, subdirectories excluded (`scripts/max-files-per-dir.ts`).

## Potential Problems

### Shared parser state

Every step mutates one `ParserState`.

### Call fan-out

Each call and loop pass reparses its body, and both share the step budget, so a loop of about 18,000 passes fails although it ends. Chains where each call uses an earlier function twice cost about 2^n parses, so about 16 levels exceed the step limit and reject valid programs.

### Failure detection

Failures and values share a return type, told apart by `typeof === "object"`. Errors have no kind, so tests match prose.

### Numeric precision

Numbers are doubles, so large integers round silently, and overflow past about 1.8e308 yields `Infinity` with no `TuffError`.

### Reference aliasing

A live `&mut` blocks reads and writes of its owner; any live reference blocks writes. `borrowedBy` scans visible scopes, so a body misses references declared after its function: `let mut x = 1; fn g() => x; let y = &mut x; g()` gives 1.

## Security Concerns

### Trust boundary

`interpretTuff` performs no I/O. The REPL, reading untrusted stdin, is the only path for untrusted text.

### Controls

Explicit stacks mean nesting costs memory, not JavaScript frames; open calls are capped at 100, and a program takes at most 200,000 steps. Future I/O goes behind a capability parameter.

### Gaps

Neither a REPL line nor a source program has a length limit.

## Future Work

### Known gaps

Not implemented: `==` and `!=` on booleans, assignment outside statement starts, function parameters, and names with digits or underscores. Also missing: arrays as function arguments, a bare array name ending a program, a readable error for `[]`, `break` and `continue`, a `while` that ends a block, statement-level `if`/`else` with assignment branches, REPL bindings across lines, and REPL `why` and `fix` output.

### Parse once

The next target: compile function and loop bodies once, so calls stop multiplying parse work. `src/code.ts` covers expressions so far.

### Call limits

Give loops their own pass limit. Keep borrow state on the cell, not in visible scopes. Move calls to their own frame stack, apart from pending operators.

### Module names

Rename `operations.ts` to `reduce.ts`, which is too close to `operators.ts`. Split parse steps by statement, bracket, and `if`.

### Errors and data

Give `TuffError` a kind enum for tests to match. Replace `number` with `bigint` or a decimal type; report line and column.

## Performance

Each loop pass rescans its text. Variable access scans stacks and scopes. Profile first.
