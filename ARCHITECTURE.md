# Architecture

Tuff is a small TypeScript interpreter run with [Bun](https://bun.com). It evaluates `let` and assignment statements followed by one expression.

## Definitions

### Grammar

Terms are joined by `+` or `-`. A term is factors joined by `*` or `/`, which bind tighter. `/` truncates toward zero, and a zero divisor is always an error. A factor is a sign, then an integer, `true` or `false`, a variable, `*name`, a bracketed expression, or an `if`. `if (c) a else b` has a boolean condition and one-factor branches. A boolean cannot be an operand of arithmetic or take a sign. Comparisons (`<`, `>`, `<=`, `>=`, `==`, `!=`) bind loosest, produce booleans, and cannot be chained.

### Statements and scope

`let [mut] NAME = expression;` binds a name of ASCII letters, and `let` cannot be a name. `NAME = expression;` reassigns a `let mut` name to a value of the same type at a statement start. A block's value is its final expression, so it cannot end with a statement. A program that ends with a `let` evaluates to 0. A block `{ ... }` scopes its bindings.

### References

`let y = &x;` binds `y` to the cell of `x`, so `*y` reads the current value of `x`. `let y = &mut x;` (`x` must be `let mut`) also allows `*y = v;`, and a `&mut` cannot overlap another reference to `x`. A reference cannot be `let mut`, reassigned, read without `*`, or pointed at another reference. `&` is valid only as the whole value of a `let`.

### Lenient branches

The unchosen branch of an `if` is parsed for syntax only. Value errors there (boolean operands, signs on booleans, non-boolean conditions, assignment type mismatches) are suppressed, and assignments have no effect. Static errors (syntax, undefined names, non-`let mut` assignment, reference misuse, division by zero) are reported.

### Results and errors

Results are `{ ok: true, value }` or `{ ok: false, error }`. A boolean program result converts to 1 or 0. `TuffError` has `what`, `where` (a zero-based offset), `why`, and `fix`.

### Examples

- `interpretTuff("2 + 3 * 4")` returns `{ ok: true, value: 14 }`.
- `interpretTuff("7 / 0")` returns an error at offset 2: `what` is `Division by zero`.
- `interpretTuff("let x = 1; let y = &x; *y")` returns `{ ok: true, value: 1 }`.

## Structure

### Source files

Checks live in `scripts/`, `eslint-rules/`, and `markdown-rules/`. Docs are at the root.

- `src/scanner.ts`: character classes, token readers, and `Operator`.
- `src/errors.ts`: `TuffError`, `Result`, `Bracket`, and error constructors.
- `src/types.ts`: parser state, stack entry types, and `Cell`.
- `src/operations.ts`: operator meaning, sign application, and reduction.
- `src/helpers.ts`: shared lookups. `src/operands.ts`, `src/operators.ts`: parse steps. `src/index.ts`: `interpretTuff`.
- `src/repl.ts`: stdin REPL. Run with `bun run repl`.
- `src/test/*.test.ts`: `bun:test` suites.

### Dependency direction

`errors.ts` depends on no project file and owns `Bracket`. `scanner.ts` depends on `errors.ts`. `types.ts` depends on `errors.ts` and `scanner.ts`. `operations.ts` depends on `errors.ts`, `scanner.ts`, `types.ts`. Parse steps depend on `helpers.ts`, which depends on `operations.ts`. `index.ts` depends on all of them. `repl.ts` and the tests depend on `index.ts`. Only `repl.ts` performs I/O.

### Implementation

`interpretTuff` is a single loop with explicit stacks and no recursion.

#### Stacks

The value stack holds integers and booleans. The operator stack holds pending operators, open brackets, bindings, and `if` entries. Scopes are a stack of maps from name to cell, searched innermost first. A reference cell has a target cell and no value of its own. A skip counter counts unchosen branches; lenient behavior applies while it is above zero.

#### Precedence

A pending operator is applied first when it binds at least as tightly, so operators are left-associative. `)` and `}` apply pending operators back to their bracket, then apply the sign before it.

### Quality gates

Every change must pass `bun run lint`, `bun test`, `bun run format:check`, and `bunx tsc --noEmit`. `bun run cpd` reports copy-paste duplicates (PMD on the PATH).

#### Lint rules

ESLint adds local rules and restricted syntax on top of its recommended set (see `eslint.config.ts`). `local/no-recursion` counts direct and aliased calls within one file, allows a cycle through a parameter, and can false-positive on method names.

#### Size and naming

Functions are capped at 100 lines, files at 500, and names need two characters. A directory may hold at most 10 files, subdirectories excluded (`scripts/max-files-per-dir.ts`). Exported top-level declarations need JSDoc, and exported types used by exports must be exported. Markdown lint caps bullet lists at 10 items and each file at 7500 characters.

## Potential Problems

### Shared parser state

Every parse step mutates one `ParserState`, so any step can touch any field.

### Lenient flag threading

A `lenient` flag reaches every reduction and sign call. Value errors pass through `valueError`, which drops them in unchosen branches; static errors never do.

### Cell kinds

A `Cell` is a value or a reference in one shape. A reference keeps an unused `value`, and `let y = &x;` pushes a placeholder 0 onto the value stack.

### Failure detection

Failures and values share a return type, told apart by `typeof === "object"`. This holds only while values are numbers and booleans.

### Numeric precision

Numbers use `parseInt` and doubles, so values above `Number.MAX_SAFE_INTEGER` round silently: `9007199254740993 + 0` gives `9007199254740992`. Results can overflow to `Infinity` with no `TuffError`, and `1 / -2` gives `-0`, which the REPL prints.

### Reference aliasing

Only references are checked against each other. Reading or assigning the owner ignores live references, so `let mut x = 0; let y = &x; x = 5; *y` gives 5. Target: freeze the owner while borrowed.

## Security Concerns

### Trust boundary

`interpretTuff` performs no I/O and takes only a string from its caller. The REPL reads untrusted stdin and is the only path where untrusted text reaches the interpreter.

### Controls

Explicit stacks mean nesting costs memory, not call frames. Future I/O must go behind a capability parameter, keeping `interpretTuff` pure.

### Gaps

The REPL reads each stdin line with no length limit. No maximum source length or nesting depth is enforced, so deep input can use a lot of memory.

## Future Work

### Known gaps

Not implemented: `==` and `!=` on booleans, assignment outside statement starts, functions, and names with digits or underscores.

### Module names

`operations.ts` is too close to `operators.ts` in name. Target: rename `operations.ts` to `reduce.ts`, and move `closeBinding` and `endStatement` from `operators.ts` into `statements.ts`. Then `src/` holds 10 files, the limit, so the next module needs a subdirectory.

### Parse tree

Build an AST in a parse module, then evaluate it separately. Lenient branches become an evaluator concern.

### Error classes

Value errors go through `valueError`; static errors do not. Target: tag each `TuffError` as static or value at construction, so the error itself drives the gate.

### Numbers and output

Replace `number` with `bigint` or a decimal type. Report line and column in `where`.

## Performance

Each token scans the operator stack and the scope chain, so cost grows with nesting depth as well as length. Profile before optimizing.
