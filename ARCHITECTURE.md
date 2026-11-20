# Architecture

Tuff is a small TypeScript interpreter run with [Bun](https://bun.com). It evaluates `let` and assignment statements followed by one expression.

## Definitions

### Grammar

Terms are joined by `+` or `-`. A term is factors joined by `*` or `/`, which bind tighter. `/` truncates toward zero, and a zero divisor is always an error. A factor is a sign, then an integer, `true` or `false`, a variable, `*name`, a bracketed expression, or an `if`. `if (c) a else b` has a boolean condition and one-factor branches. A boolean cannot be an operand of arithmetic or take a sign. Comparisons (`<`, `>`, `<=`, `>=`, `==`, `!=`) bind loosest, produce booleans, and cannot be chained.

### Statements and scope

`let [mut] NAME = expression;` binds a name of ASCII letters, and `let` cannot be a name. `NAME = expression;` reassigns a `let mut` name to a value of the same type at a statement start. A block's value is its final expression, so it cannot end with a statement. A program that ends with a `let` evaluates to 0. A block `{ ... }` scopes its bindings.

### References

`let y = &x;` binds `y` to the cell of `x`, so `*y` reads `x`. `let y = &mut x;` (`x` must be `let mut`) also allows `*y = v;`, and a `&mut` cannot overlap another reference to `x`. A reference cannot be `let mut`, reassigned, read without `*`, or pointed at another reference. `&` is valid only as the whole value of a `let`, or as the last item of a braced block or if-branch that is one; its target must be outside the block.

### Lenient branches

The unchosen branch of an `if` is parsed for syntax only. Every error there is reported, and assignments have no effect.

### Results and errors

Results are `{ ok: true, value }` or `{ ok: false, error }`. A boolean program result converts to 1 or 0. `TuffError` has `what`, `where` (a zero-based offset), `why`, and `fix`. A `fix` is an edit the grammar allows, so it never asks for something the same error forbids.

### Examples

- `interpretTuff("2 + 3 * 4")` returns `{ ok: true, value: 14 }`.
- `interpretTuff("let x = 1; let y = &x; *y")` returns `{ ok: true, value: 1 }`.

## Structure

### Source files

Checks live in `scripts/`, `eslint-rules/`, and `markdown-rules/`.

- `src/scanner.ts`: character classes, token readers, and `Operator`.
- `src/errors.ts`: `TuffError`, `Result`, `Bracket`, and error constructors.
- `src/types.ts`: parser state, stack entry types, and `Cell`.
- `src/operations.ts`: operator meaning, sign application, and reduction.
- `src/parse/helpers.ts`: shared lookups and state transitions (`completeBranch`, `pushOperand`, `attachRef`). `src/parse/operands.ts`, `src/parse/operators.ts`: parse steps, with `*` in `operands.ts`. `src/parse/references.ts`: `&` steps. `src/index.ts`: `interpretTuff`.
- `src/repl.ts`: stdin REPL (`bun run repl`).
- `src/test/*.test.ts`: `bun:test` suites.

### Dependency direction

`errors.ts` depends on no project file and owns `Bracket`. `scanner.ts` depends on `errors.ts`. `types.ts` depends on `errors.ts` and `scanner.ts`. `operations.ts` depends on `errors.ts`, `scanner.ts`, `types.ts`. In `src/parse/`, steps depend on `helpers.ts`, `references.ts` and `operations.ts`, `references.ts` depends on `helpers.ts`, and `helpers.ts` depends on `operations.ts`. `index.ts` depends on all of them. `repl.ts` and the tests depend on `index.ts`. Only `repl.ts` performs I/O.

### Implementation

`interpretTuff` is a single loop with explicit stacks and no recursion.

#### Stacks

The value stack holds integers and booleans. The operator stack holds pending operators, open brackets, bindings, and `if` entries. Scopes are a stack of maps from name to cell, searched innermost first. A reference cell has a target cell and no value of its own. A skip counter counts unchosen branches.

#### Precedence

A pending operator is applied first when it binds at least as tightly, so operators are left-associative. `)` and `}` apply pending operators back to their bracket, then apply the sign before it.

### Quality gates

Every change must pass `bun run lint`, `bun test`, `bun run format:check`, and `bunx tsc --noEmit`. `bun run cpd` finds copy-paste duplicates.

#### Lint rules

ESLint adds local rules and restricted syntax to its recommended set (`eslint.config.ts`). `local/no-recursion` checks calls within one file and can false-positive on method names.

#### Size and naming

Functions are capped at 100 lines, files at 500, and names need two characters. A directory may hold at most 10 files, subdirectories excluded (`scripts/max-files-per-dir.ts`). Exported top-level declarations need JSDoc, and exported types used by exports must be exported. Markdown lint caps bullet lists at 10 items and each file at 7500 characters.

## Potential Problems

### Shared parser state

Every parse step mutates one `ParserState`, so any step can touch any field.

### Lenient flag threading

A `lenient` flag only guards writes: the assignment in `closeBinding` and the skip counter. No error depends on it.

### Cell kinds

A reference cell keeps an unused `value`, and a `let` with `&` pushes a placeholder 0.

### Failure detection

Failures and values share a return type, told apart by `typeof === "object"`. This holds only while values are numbers and booleans.

### Numeric precision

Numbers use `parseInt` and doubles, so values above `Number.MAX_SAFE_INTEGER` round silently: `9007199254740993 + 0` gives `9007199254740992`. Results can overflow to `Infinity` with no `TuffError`, and `1 / -2` gives `-0`, which the REPL prints.

### Reference aliasing

A live `&mut` blocks reads and writes of its owner, and any live reference blocks writes (`borrowedBy` in `src/parse/helpers.ts`).

### Misleading fixes

Reassigning a reference reports `notMutable`, whose fix (`let mut`) is forbidden for references.

## Security Concerns

### Trust boundary

`interpretTuff` performs no I/O and takes only a string from its caller. The REPL reads untrusted stdin and is the only path where untrusted text reaches the interpreter.

### Controls

Explicit stacks mean nesting costs memory, not call frames. Future I/O must go behind a capability parameter, keeping `interpretTuff` pure.

### Gaps

The REPL reads each stdin line with no length limit. No maximum source length or nesting depth is enforced, so deep input can use a lot of memory.

## Future Work

### Known gaps

Not implemented: `==` and `!=` on booleans, assignment outside statement starts, functions, and names with digits or underscores. Also missing: REPL bindings across lines, and REPL output of `why` and `fix`.

### Module names

`operations.ts` is too close to `operators.ts` in name. Target: rename `operations.ts` to `reduce.ts`, move `closeBinding` and `endStatement` into `src/parse/statements.ts`, and move bracket and `if` steps into `src/parse/brackets.ts` and `src/parse/ifs.ts`.

### Error kinds

Give `TuffError` a kind enum, so tests match kinds rather than message text. Split `errors.ts` (607 lines, mostly constructors) by category before it nears the 500-line limit.

### Parse tree

Build an AST in a parse module, then evaluate it separately. Lenient branches become an evaluator concern.

### Numbers and output

Replace `number` with `bigint` or a decimal type. Report line and column in `where`.

## Performance

Each token scans the operator stack, and each variable access scans the scope chain and `borrowedBy`. Profile first.
