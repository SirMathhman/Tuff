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

Unchosen `if` branches and unchosen `match` cases are parsed for syntax only: errors are reported, assignments have no effect.

### Results and errors

Results are `{ ok: true, value }` or `{ ok: false, error }`. A boolean program result converts to 1 or 0. `TuffError` has `what`, `where` (a zero-based offset), `why`, and `fix`. A `fix` is an edit the grammar allows.

## Structure

### Source files

- `src/scanner.ts`: character classes, token readers, bracket matching.
- `src/code.ts`: compiled expressions, not yet used by `interpretTuff`.
- `src/errors/`: `core.ts` types, and constructors by family.
- `src/types.ts`: parser state, stack entry types, and `Cell`.
- `src/operations.ts`: operator meaning, sign application, and reduction.
- `src/parse/`: one file per construct family; `helpers.ts` and `operators.ts` are shared.
- `src/index.ts`: `interpretTuff`. `src/repl.ts`: stdin REPL (`bun run repl`).
- `src/test/`: `bun:test` suites and shared messages.

### Dependency direction

`errors/` depends on nothing outside itself, and `core.ts` owns `Bracket`. `scanner.ts` depends on `errors/`. `types.ts` depends on both. `operations.ts` depends on `errors/`, `scanner.ts`, `types.ts`. In `src/parse/`, `helpers.ts` depends on `operations.ts`. `references.ts`, `calls.ts`, `loops.ts`, `matches.ts`, and `arrays.ts` depend on `helpers.ts`, never on each other; the last three also use `operations.ts`. `operands.ts` depends on those five, and `operators.ts` depends on `loops.ts`, `matches.ts`, and `arrays.ts`. `code.ts` depends on `errors/`, `operations.ts`, `scanner.ts`, and `types.ts`; nothing depends on it yet. `index.ts` depends on all of them; `repl.ts` and the tests on `index.ts`. Only `repl.ts` performs I/O. Import cycles between project files are not allowed.

### Implementation

`interpretTuff` is one loop over explicit stacks, with no recursion.

#### Stacks

Value, operator, and scope stacks, plus a skip counter for unchosen branches. A `while`, `match`, array literal, or index pushes its own entry on the operator stack. A call pushes a `Call` entry that saves the caller's state. A callee sees its declaration's snapshot and later open-scope functions.

#### Precedence

Pending operators apply left-associatively. `)` and `}` apply pending operators back to their bracket, then the sign before it.

### Quality gates

Every change must pass `bun run lint`, `bun test`, `bun run format:check`, and `bunx tsc --noEmit`. ESLint enforces `import-x/no-cycle`, and `local/no-recursion` checks one file only.

#### Size and naming

Functions are capped at 100 lines, files at 500, and names need two characters. A directory holds at most 10 files (`scripts/max-files-per-dir.ts`).

## Potential Problems

### Shared parser state

Every step mutates one `ParserState`.

### Call fan-out

Each call and loop pass reparses its body within one step budget: a loop of about 18,000 passes fails although it ends, and chains where each call uses an earlier function twice cost about 2^n parses.

### Failure detection

Failures and values share a return type, told apart by `typeof`.

### Two evaluators

`code.ts` and `parse/` share the sign rule (`signOf`), bracket matching, and precedence; differential tests check the rest.

### Numeric precision

Numbers are doubles: large integers round silently, and overflow yields `Infinity` with no `TuffError`.

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

Not implemented: `==`/`!=` on booleans, assignment outside statement starts, function parameters, names with digits or underscores, arrays as arguments, `break`/`continue`, a `while` ending a block, `if`/`else` with assignment branches, REPL bindings across lines, and REPL `why`/`fix` output.

### Parse once

Compile function and loop bodies once, so calls stop multiplying parse work. A compiled body is an instruction list with no parser state, run per call against an environment. `src/code.ts` covers expressions, top-level `let`, and assignment, but `interpretTuff` does not use it. Once it does, retire `parse/` and move the sign, bracket, and precedence rules into one module that both sides import.

### Call limits

Give loops their own pass limit. Keep borrow state on the cell. Move calls to their own frame stack, apart from pending operators.

### Module names

Rename `operations.ts` to `reduce.ts` (too close to `operators.ts`) and `code.ts` to `compile.ts`. Split parse steps by statement, bracket, and `if`. `src/errors/` is at its 10-file cap.

### Errors and data

Give `TuffError` a kind enum for tests to match. Replace `number` with `bigint` or a decimal type; report line and column.

## Performance

Each loop pass rescans its text. Variable access scans stacks and scopes. Profile first.
