# Architecture

Tuff is a small TypeScript interpreter run with [Bun](https://bun.com).

## Definitions

### Grammar

Terms are joined by `+` or `-`. A term is factors joined by `*` or `/`, which bind tighter. Two terms may be joined by one comparison (`<`, `<=`, `>`, `>=`, `==`, `!=`), which yields a boolean; comparisons do not chain. `/` truncates toward zero; a zero divisor is an error. A factor is a sign, then an integer, `true` or `false`, a variable, `*name`, `NAME()`, `NAME[e]`, a bracketed expression, an `if`, or `match (v) { case L => e; }`, taking the first matching case (`case _` last); no match is an error. `fn NAME() => e;` declares a parameterless function. Functions are hoisted within open scopes. A braced body needs no `;`; ending in an assignment makes the call 0. `if (c) a else b` has a boolean condition and one-factor branches. A statement-level braced `if` may omit `else`; a body ending in a statement is an error when `else` follows. A boolean takes no arithmetic or sign.

### Statements and scope

`let [mut] NAME = expression;` binds an ASCII name; `let` is reserved. `let a = [e, ...];` makes an array (nesting allowed), and `let b = a;` moves it; `a[i] = v;` sets an element of a `let mut` array. `NAME = expression;` and `NAME op= expression;` reassign a `let mut` name at a statement start, keeping its type. A block's value is its final expression, unless a top-level block ends in an assignment (discarded). A program ending in `let` is 0. `while (c) { b }` repeats `b` while boolean `c` holds. It has no value, so a block cannot end in it.

### References

`let y = &x;` binds `y` to the cell of `x`, so `*y` reads `x`. `let y = &mut x;` (`x` must be `let mut`) also allows `*y = v;`, and a `&mut` cannot overlap another reference to `x`. A reference cannot be `let mut`, reassigned, read without `*`, or pointed at another reference. `&` is valid only as the whole value of a `let`, or as the last item of a braced block or if-branch that is one; its target must be outside the block.

### Lenient branches

Unchosen `if` branches and `match` cases are checked for syntax only: errors are reported, assignments have no effect.

### Results and errors

Results are `{ ok: true, value }` or `{ ok: false, error }`. A boolean program result converts to 1 or 0. `TuffError` has `what`, `where` (a zero-based offset), `why`, and `fix`.

## Structure

### Source files

- `src/scanner.ts`: character classes, token readers, bracket matching.
- `src/code.ts`, `src/compile-expression.ts` compile; `src/instructions.ts` defines instructions; `src/run.ts` runs.
- `src/errors/`: `core.ts` types, and constructors by family.
- `src/types.ts`: parser state, stack entry types, and `Cell`.
- `src/operations.ts`: operator meaning, signs, and reduction.
- `src/parse/`: one file per construct family; `helpers.ts` and `operators.ts` are shared.
- `src/index.ts`: `interpretTuff`. `src/repl.ts`: stdin REPL (`bun run repl`).
- `src/test/`: `bun:test` suites.

### Dependency direction

`errors/` depends on nothing outside itself, and `core.ts` owns `Bracket`. `scanner.ts` depends on `errors/`. `types.ts` depends on both. `operations.ts` depends on `errors/`, `scanner.ts`, `types.ts`. In `src/parse/`, `helpers.ts` depends on `operations.ts`; the family files (`references`, `calls`, `loops`, `matches`, `arrays`) depend on `helpers.ts` and never on each other; `operands.ts` and `operators.ts` depend on them. `instructions.ts` depends on `scanner.ts` and `types.ts`. `compile-expression.ts` depends on `errors/`, `operations.ts`, `scanner.ts`, and `instructions.ts`. `code.ts` depends on those and on `compile-expression.ts`. `run.ts` depends on `errors/`, `operations.ts`, `instructions.ts`, and `types.ts`, never on the compiler. `index.ts` depends on all of them; `repl.ts` and the tests on `index.ts`. Only `repl.ts` performs I/O. Import cycles between project files are not allowed.

### Implementation

`interpretTuff` falls back to the parser (one loop over explicit stacks) for constructs the compiled path lacks.

#### Stacks

Value, operator, and scope stacks, plus a skip counter for unchosen branches. A `while`, `match`, array literal, or index pushes its own entry on the operator stack. A call pushes a `Call` entry saving the caller's state. A callee sees its declaration's snapshot and later open-scope functions.

#### Precedence

Pending operators apply left-associatively. `)` and `}` apply pending operators back to their bracket, then the sign before it.

### Quality gates

Changes must pass `bun run lint`, `bun test`, `bun run format:check`, and `bunx tsc --noEmit`. `local/no-recursion` checks one file only.

#### Size and naming

Functions are capped at 100 lines, files at 500, and names need two characters. A directory holds at most 10 files (`scripts/max-files-per-dir.ts`).

## Potential Problems

### Shared parser state

Every step mutates one `ParserState`.

### Call fan-out

Each call and loop pass reparses its body within one step budget: a loop of about 18,000 passes fails although it ends, and chains doubling an earlier function cost about 2^n parses.

### Failure detection

Failures and values share a return type, told apart by `typeof`. `values.pop() ?? 0` in `index.ts` and `run.ts` turns a broken stack into 0.

### Two evaluators

`parse/` and `code.ts` with `run.ts` duplicate the rules; differential tests check them. Both may report a later error before an earlier one in a block (`let a = { 1 2 }; let b = ;`).

### Numeric precision

Numbers are doubles: large integers round silently; overflow yields `Infinity`, not a `TuffError`.

### Lenient cost

Unchosen branches run with writes suppressed; loops and calls must stay bounded when they compile.

### Reference aliasing

A live `&mut` blocks reads and writes of its owner; any live reference blocks writes. `borrowedBy` scans only visible scopes, so `let mut x = 1; fn g() => x; let y = &mut x; g()` gives 1.

## Security Concerns

### Trust boundary

`interpretTuff` does no I/O; only the REPL, reading untrusted stdin, takes untrusted text.

### Controls

Explicit stacks keep nesting off the JavaScript call stack; open calls are capped at 100, and a program takes at most 200,000 steps. Any runner must enforce the same step budget. Future I/O goes behind a capability parameter.

### Gaps

No REPL line or program has a length limit. `runCode` enforces the same budget.

## Future Work

Missing: `==`/`!=` on booleans, assignment outside statement starts, function parameters, digits or underscores in names, array arguments, `break`/`continue`, `while` ending a block, assignment in `if` branches, REPL bindings across lines, and REPL `why`/`fix` output.

### Parse once

Compile function and loop bodies once, run by `run.ts`. Still to compile: statement-start blocks, unbraced `if`, `match`, `while`, functions, arrays, references. Then retire `parse/`.

### Call limits

Give loops their own pass limit; keep borrow state on the cell; move calls onto `run.ts`'s frame stack.

### Module names

Rename `operations.ts` to `reduce.ts` (too close to `operators.ts`) and `code.ts` to `compile.ts`; Split parse steps by statement, bracket, and `if`. `src/errors/` is at its 10-file cap.

### Errors and data

Give `TuffError` a kind enum for tests to match. Replace `number` with `bigint` or a decimal type; report line and column.

## Performance

Each loop pass rescans its text. Variable access scans stacks and scopes. Profile first.
