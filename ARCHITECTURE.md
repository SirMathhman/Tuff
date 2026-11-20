# Architecture

Tuff is a small TypeScript interpreter run with [Bun](https://bun.com). It evaluates `let` and assignment statements followed by one expression.

## Definitions

### Grammar

Terms are joined by `+` or `-`. A term is factors joined by `*` or `/`, which bind tighter. `/` truncates toward zero, and a zero divisor is always an error. A factor is a sign, then an integer, `true` or `false`, a variable, `*name`, a bracketed expression, or an `if`. `let y = &x;` makes a read-only alias of `x`. `if (c) a else b` has a boolean condition and one-factor branches. A boolean cannot be an operand of arithmetic or take a sign. Comparisons (`<`, `>`, `<=`, `>=`, `==`, `!=`) bind loosest, produce booleans, and cannot be chained.

### Statements and scope

`let [mut] NAME = expression;` binds a name of ASCII letters, and `let` cannot be a name. `NAME = expression;` reassigns a `let mut` name to a value of the same type at a statement start.

### Blocks

A block's value is its final expression, so it cannot end with a statement. A program that ends with a `let` evaluates to 0. A block `{ ... }` scopes its bindings, and a repeat in the same block replaces the value.

### Lenient branches

The unchosen branch of an `if` is parsed for syntax only. Value errors there (boolean operands, signs on booleans, non-boolean conditions, assignment type mismatches) are suppressed, and assignments have no effect. Static errors (syntax, undefined names, non-`let mut` assignment, division by zero) are reported.

### Results and errors

Results are `{ ok: true, value }` or `{ ok: false, error }`. A boolean program result converts to 1 or 0. `TuffError` has `what`, `where` (a zero-based offset), `why`, and `fix`.

### Examples

#### Arithmetic and grouping

- `interpretTuff("2 + 3 * 4")` returns `{ ok: true, value: 14 }`.
- `interpretTuff("(2 + 3 }")` returns an error at offset 7: `what` is `Expected ')' to close '(' but found '}'`.

#### Conditionals

- `interpretTuff("if (1 < 2) 7 else x")` returns `{ ok: true, value: 7 }`.

#### Errors

- `interpretTuff("")` returns an error at offset 0: `what` is `Expected a number, a variable, '(', or '{' but found the end of the input`.
- `interpretTuff("1 + x")` returns an error at offset 4: `what` is `Name 'x' is not defined`.
- `interpretTuff("7 / 0")` returns an error at offset 2: `what` is `Division by zero`.

#### Statements

- `interpretTuff("let mut x = 0; x = 1; x")` returns `{ ok: true, value: 1 }`.
- `interpretTuff("{ let x = 1; }")` returns an error at offset 13: a block must end with an expression.

## Structure

### Source files

Repository checks live in `scripts/`, custom ESLint rules in `eslint-rules/`, custom Markdown rules in `markdown-rules/`, and docs at the root.

- `src/scanner.ts`: character classes, token readers, and `Operator`.
- `src/errors.ts`: `TuffError`, `Result`, `Bracket`, and error constructors.
- `src/types.ts`: parser state and stack entry types.
- `src/operations.ts`: operator meaning and reduction.
- `src/helpers.ts`, `src/operands.ts`, `src/operators.ts`: parse steps. `src/index.ts`: `interpretTuff`.
- `src/repl.ts`: stdin REPL. Run with `bun run repl`.
- `src/test/*.test.ts`: `bun:test` suites.

### Dependency direction

`errors.ts` depends on no project file and owns `Bracket`. `scanner.ts` depends on `errors.ts`. `types.ts` depends on `errors.ts` and `scanner.ts`. `operations.ts` depends on `errors.ts`, `scanner.ts`, `types.ts`. Parse steps depend on `helpers.ts`. `index.ts` depends on all of them. `repl.ts` and the tests depend on `index.ts`. Only `repl.ts` performs I/O.

### Implementation

`interpretTuff` is a single loop with explicit stacks and no recursion.

#### Stacks

The value stack holds integers and booleans. The operator stack holds pending operators, open brackets, bindings, and `if` entries. Scopes are a stack of maps, searched innermost first. A skip counter counts unchosen branches; lenient behavior applies while it is above zero.

#### Precedence

A pending operator is applied first when it binds at least as tightly, so operators are left-associative. `)` and `}` apply pending operators back to their bracket, then apply the sign before it.

### Quality gates

Every change must pass `bun run lint`, `bun test`, `bun run format:check`, and `bunx tsc --noEmit`. `bun run cpd` reports copy-paste duplicates (PMD on the PATH).

#### ESLint rules

ESLint runs its recommended rules plus these. Restricted syntax bans member chains such as `a.b.c`, regex literals, `RegExp`, `match`/`matchAll`/`search`, object types, string literal types, and null types.

#### Recursion

The `local/no-recursion` rule counts direct calls by name, through aliases, as methods, and into nested closures. A cycle through a parameter is allowed. The rule sees one file only.

##### Limits

Method names match loosely, so unrelated objects can produce false positives. Computed keys are not matched.

#### Size and naming

Functions are capped at 100 lines, files at 500, and names need two characters (`max-lines-per-function`, `max-lines`, `id-length`).

##### Directories

A directory may hold at most 10 files of any type, subdirectories excluded. `scripts/max-files-per-dir.ts` checks this.

#### Documentation

Exported top-level functions, classes, interfaces, type aliases, and enums need JSDoc. Exported functions need `@param` names and a `@returns` entry.

#### Exports and Markdown

Types used by exports must be exported. Markdown lint caps bullet lists at 10 items and each file at 7500 characters.

## Potential Problems

### Shared parser state

Every parse step mutates one `ParserState`, so any step can touch any field, and the shape grows with each construct.

### Lenient flag threading

A `lenient` flag reaches every reduction and sign call. Value errors pass through `valueError`, which drops them in unchosen branches; static errors are never passed through it. The assignment type check in `closeBinding` goes through `valueError` too.

### Numeric precision

Numbers use `parseInt` and doubles, so values above `Number.MAX_SAFE_INTEGER` round silently: `9007199254740993 + 0` gives `9007199254740992`. Results can overflow to `Infinity` with no `TuffError`, and `1 / -2` gives `-0`, which the REPL prints.

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

### Parse tree

Build an AST in a parse module, then evaluate it separately. Lenient branches become an evaluator concern.

### Error classes

Value errors go through `valueError`; static errors do not. Not yet done: tag each `TuffError` as static or value at construction, so the error itself drives the gate.

### Numbers and output

Replace `number` with `bigint` or a decimal type. Report line and column in `where`.

## Performance

The scan is linear in source length. Profile before optimizing.
