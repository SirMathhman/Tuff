# Architecture

Tuff is a small TypeScript interpreter run with [Bun](https://bun.com). It evaluates `let` and assignment statements followed by one expression. It is at an early stage, and the sections below give the details.

## Source files

Repository layout and dependency rules.

### Interpreter (src/index.ts)

Exports `interpretTuff`. Error types and messages live in `src/errors.ts`.

### REPL (src/repl.ts)

Reads stdin lines, evaluates each with `interpretTuff`, and prints the value or the error. Run with `bun run repl`.

### Tests (src/index.test.ts)

Uses Bun's built-in `bun:test` runner. Each feature has a test named after its expression. Error tests check all four `TuffError` fields.

### Dependency direction

`repl.ts` and `index.test.ts` depend on `index.ts`. `index.ts` depends only on `errors.ts`, which depends on no project file. Neither performs I/O.

### Configuration

`package.json` holds the `lint`, `repl`, `format`, and `format:check` scripts and the dev dependencies. `tsconfig.json` configures TypeScript, and `bun.lock` pins versions.

## Language

A program is zero or more statements, each a `let` or an assignment ending in `;`, followed by one expression.

### Grammar

Terms are joined by `+` or `-`. A term is factors joined by `*`, and `*` binds tighter. A factor is a sign, then an integer, a variable, or a parenthesized or braced expression.

### Statements and scope

`let [mut] NAME = expression;` binds a name of ASCII letters, and `let` cannot be a name. `NAME = expression;` reassigns a `let mut` name at a statement start.

### Blocks

A block's value is its final expression, so it cannot end with a statement. A program that ends with a `let` evaluates to 0. A block `{ ... }` scopes its bindings, and a repeat in the same block replaces the value.

### Results and errors

Results are `{ ok: true, value }` or `{ ok: false, error }`. `TuffError` has four parts: `what`, `where` (a zero-based offset), `why`, and `fix`.

### Examples

Each example below shows the result of `interpretTuff` on the given input.

#### Sums and differences

- `interpretTuff("5")` returns `{ ok: true, value: 5 }`.
- `interpretTuff("1 + 2")` returns `{ ok: true, value: 3 }`.
- `interpretTuff("2 + 3 - 4")` returns `{ ok: true, value: 1 }`.
- `interpretTuff("1 - -2")` returns `{ ok: true, value: 3 }`.

#### Products and grouping

- `interpretTuff("2 + 3 * 4")` returns `{ ok: true, value: 14 }`.
- `interpretTuff("(2 + 3) * 4")` returns `{ ok: true, value: 20 }`.
- `interpretTuff("-(2 + 3) * 4")` returns `{ ok: true, value: -20 }`.

#### Brackets

- `interpretTuff("{ 2 + 3 } * 4")` returns `{ ok: true, value: 20 }`.
- `interpretTuff("(2 + 3 }")` returns an error at offset 7: `what` is `Expected ')' to close '(' but found '}'`.

#### Errors

Each example below gives an error at the stated offset.

##### Operand examples

- `interpretTuff("")` returns an error at offset 0: `what` is `Expected a number, a variable, '(', or '{' but found the end of the input`.
- `interpretTuff("1 + x")` returns an error at offset 4: `what` is `Name 'x' is not defined`.

##### Operator examples

- `interpretTuff("2x")` returns an error at offset 1: `what` is `Expected '+', '-', or '*' but found 'x'`.
- `interpretTuff("(2 + 3")` returns an error at offset 6: `what` is `Expected ')' but found the end of the input`.

#### Statement examples

##### Values

- `interpretTuff("let x = 1;")` returns `{ ok: true, value: 0 }`.
- `interpretTuff("{ let x = 2 + 3; x } * 4")` returns `{ ok: true, value: 20 }`.
- `interpretTuff("let mut x = 0; x = 1; x")` returns `{ ok: true, value: 1 }`.

##### Scope

- `interpretTuff("{ let x = 1; }")` returns an error at offset 13: a block must end with an expression, not a statement.
- `interpretTuff("{ let x = 1; x } + x")` returns an error at offset 19: `x` is out of scope.

## Implementation

`interpretTuff` is a single loop with explicit stacks and no recursion.

### Stacks

A value stack holds numbers. An operator stack holds pending operators, open brackets, and `let` bindings. Scopes form a stack of maps, and a name is looked up from the innermost scope outwards.

### Precedence

A pending operator is applied first when it binds at least as tightly, so operators are left-associative. `)` and `}` apply pending operators back to their bracket, then scale the value by the sign before it.

### Operand errors

No digits, name, or opening bracket where an operand belongs gives `Expected a number, a variable, '(', or '{'`. A name that is not declared gives `Name 'x' is not defined`.

### Operator and bracket errors

A character that is not an operator gives `Expected '+', '-', or '*'`. Inside brackets, `')'` and `'}'` are also listed. Input ending inside a bracket gives `Expected ')'` or `Expected '}'`.

### Statement errors

A `let` with no name, a keyword as its name, no `=`, or no `;` has its own message. A misplaced `let`, a stray `;`, reassigning a plain `let`, and assigning an undeclared name each have a message too.

## Quality gates

Every change must pass `bun run lint`, `bun test`, `bun run format:check`, and `bunx tsc --noEmit`.

### ESLint rules

ESLint runs the recommended JavaScript and TypeScript rules and the rules below. Restricted syntax bans regex literals, `RegExp`, `match`/`matchAll`/`search`, object type literals, and string literal types.

### Recursion

The `local/no-recursion` rule counts direct calls by name, through aliases, as methods, and into nested closures. A cycle through a parameter is allowed. The rule sees one file only.

#### Limits

Method names match loosely, so unrelated objects can produce false positives. Computed keys are not matched.

### Size and naming

`max-lines-per-function` caps functions at 100 lines, `max-lines` caps files at 500, and `id-length` requires names of at least two characters. Blank lines and comments are skipped.

#### Directories

A directory may hold at most 10 files of any type, subdirectories excluded. `scripts/max-files-per-dir.ts` checks this.

### Documentation

Exported top-level functions, classes, interfaces, type aliases, and enums need JSDoc. Exported functions need `@param` names and a `@returns` entry.

### Exports and Markdown

The unused-export check fails on any export that no other file uses. Markdown lint caps bullet lists at 10 items, subsections at 5, and section text at 250 characters.

## Risks and future work

Known gaps, numeric risks, security, and planned work.

### Known gaps

Operators are `+`, `-`, and `*`, applied to integers, variables, and groups. Not implemented: division, assignment outside statement starts, functions, and names with digits or underscores.

### Numeric risks

Numbers use `parseInt` and doubles, so values above `Number.MAX_SAFE_INTEGER` round silently. `9007199254740993 + 0` gives `9007199254740992` with `ok: true`. A 400-digit literal gives `Infinity`.

### Security

`interpretTuff` performs no I/O. The REPL reads untrusted stdin with no length limit, which is not yet implemented. Nesting costs memory, not call frames. Future I/O must go behind an explicit capability parameter.

### Future work

Planned changes, in rough order.

#### Structure

- Split into `lexer`, `parser` (producing an AST), and `evaluator`, with `interpretTuff` as the composition point. The combined evaluator is a stopgap until then.
-

#### Numbers and output

- Replace `number` with `bigint` or a decimal type, so arithmetic is exact.
- Report line and column in `where`, not just the offset.

### Performance

The scan is linear in source length. A long digit run is one `parseInt` call, which gives no meaningful value past the safe-integer limit. Profile before optimizing.
