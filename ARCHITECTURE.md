# Tuff Architecture

The ideal architecture: a small, pure, layered interpreter whose failures are structured values, not exceptions or silent coercions.

## Definitions

### Program terms

- **Source**: the text of a Tuff program. Always untrusted.
- **Entry point**: `interpretTuff(source)`, the only public function.
- **Value**: a number, a boolean, a one-character string, or an array. An array's element type is part of its type: `[[1], [2]]` is an array of arrays of numbers, and every element and every assignment must match it. A program evaluates to a number; a boolean result is 1 or 0, and a string result is its Unicode code point.
- **Token**: a kind and its text. Kinds are punctuation, keyword, number, name, string, and unclosed string. A quoted literal is one string token; an unclosed quote is its own kind. Source spans come with the near-term item below.

### Bindings and scope

- **Binding**: a name paired with a value, introduced by `let`. `let mut` allows reassignment.
- **Scope**: the bindings visible at a point, innermost first. Inner names shadow outer ones.
- **Block**: bindings followed by one result expression.

### Errors and purity

- **Result**: a tagged union, `ok` or `err`, used instead of throwing.
- **TuffError**: a structured enum stating what failed, where, why, and how to fix it.
- **Pure core**: no I/O, no dynamic code evaluation, no reads of ambient state.

## Structure

Dependency direction is strictly downward. No cycles exist; `madge --circular` in `lint` enforces this.

### Layers

1. Entry points: REPL and file runner. The only layer allowed to do I/O.
2. Public API: `interpretTuff` and its exported types, from `index.ts`. It composes the pipeline and nothing else.
3. Pipeline: the stage modules listed below. Each depends only on the layers beneath it.
4. Shared core (`errors.ts`): `Result`, `TuffError`, `ErrorWhere`. Depends on nothing else.

### Pipeline

1. `tokenizer.ts`: a character scanner that emits typed tokens, each with its kind and text.
2. `parser.ts` parses expressions by precedence; `statements.ts` parses statements and blocks.
3. `evaluator.ts`: a pure fold over the AST.

### Shared rules

- `conditions.ts` holds the `( expr )` condition rule. `parse-errors.ts` holds error constructors and position helpers.
- `ast.ts` holds AST types, so the evaluator depends on the AST rather than on the parser.

### Dependency rules

- Stage modules import only the core, `tokenizer.ts`, `parse-errors.ts`, `ast.ts`, and each other.
- A rule that would close a cycle receives the other rule as a parameter. No parser module imports the expression parser.

### Size limits

- No directory holds more than 10 files; `scripts/check-file-count.ts` enforces this in `lint`.
- Functions, files, and directories stay under the limits in `eslint.config.js`; exceeding one is a split signal.

### Tests

- Tests live beside their code (`*.test.ts`), exercising the public API first and the stages second.

## Recursion

Recursion is limited to the parser, the statement rules, and the evaluator over the AST. Mutual recursion is forbidden, within a file and across files.

### Passing rules as parameters

- A rule that would close a cycle receives the other rule as a parameter, as `blockBody` receives `parseExpr`.
- Each expression kind is evaluated by its own rule, and each rule receives `evaluate` as a parameter. The evaluator never runs during parsing.

## Grammar

### Logical and comparison operators

- `||` binds loosest, then `&&`. Both short-circuit and take booleans.
- Comparisons `<`, `<=`, `>`, `>=`, `==`, and `!=` bind tighter than `&&`, do not chain, and yield booleans. Ordering takes numbers; equality takes two values of one type.

### Arithmetic and unary operators

- `+`, `-`, and `*` fold left to right, with `*` binding tighter.
- `!` takes a following factor and a boolean, so `!!x` nests. A single unary `-` precedes a primary: a number, a name, a group, a block, or an if.

### Blocks and if

- `if (cond) a else b` takes a boolean condition and requires both branches; the else branch is a comparison, so `&&` and `||` after it apply to the whole if.
- A `{` at statement position opens a statement block when its contents begin with a statement and the token after its `}` ends the statement.

### Blocks as values

- A block used as a value ends in a final expression.
- A program made only of statements evaluates to 0.

### Names and numbers

- Names bind with `let`. Undeclared names and assignments to immutable names are errors.
- Numbers are JavaScript doubles. Results above 2^53 are rejected, so precision is never lost silently.

### Arrays

- An array literal `[a, b]` takes its element type from its elements, so `[[1], ['a']]` is an error. An empty literal `[]` is an error because it has no element type.
- `name = expr` and `name[i] = expr;` must keep the type of the target, at every depth.
- `array[i]` reads an element. Negative or out-of-range indexes are IndexOutOfRange errors.
- Indexing a name does not move it. Reading a whole array by name moves it, so a later use is a UseAfterMove error until the name is assigned again.
- A nested array read is a copy, so the copy can be changed without touching its source.
- Arrays cannot be compared or returned as a program result.

### Tokens

- Brackets, operators, `=`, and `;` are self-delimiting, so spacing never changes meaning.
- Spaces, tabs, and newlines separate tokens. `true` and `false` are booleans. A single-quoted literal such as `'a'` is a one-character string, with backslash escapes for backslash, single quote, newline, and tab; `==` and `!=` compare strings, and other operators reject them.
- The parser dispatches on token kind, never on token text. An unclosed quote reports as an unclosed string, never as a bad escape.

### Compatibility

- Number literals follow JavaScript number syntax. Widening the grammar is additive; narrowing it is breaking.

## Potential Problems

### Resource limits

- Very large sources and deeply nested expressions can exhaust time or the call stack.
- Nesting counts every nested construct against one limit of 1000 levels. Exceeding it is `NestingTooDeep`.

### Stack safety

- Operator chains fold with `reduce`, so their length never depends on the call stack.
- Exception-based failure paths creep in unless the Result pattern is enforced from the start.

### Growth

- Dispatch functions grow with every new expression kind. Each kind should get its own rule instead.

## Security Concerns

Source is untrusted input. It arrives from the REPL, from files, and from a model that writes Tuff code.

### Code execution and host access

- No `eval`, `Function`, or dynamic import of anything derived from source.
- No filesystem, network, process, or global access. Host capabilities are passed in explicitly and absent by default.

### Input tokens

- Operators are recognized only by the tokenizer's character scanner, so no source character can form a token outside the grammar.

### Output and limits

- Output is data only. Values are never rendered as markup or executed by the caller.
- Limits on source size, nesting depth, and evaluation steps keep hostile input from hanging or crashing the host.

### Known gaps

- Nesting depth is enforced. Source size and evaluation-step limits are not enforced yet.
- Model-driven prompt injection reaches the evaluator through source text. The host-capability whitelist must be designed before any host function exists.

### State changes

- The interpreter changes no state outside its own evaluation. Any future host function is an unauthenticated state change and needs an explicit capability grant.

## Future Work

### Near term

1. Add character spans to typed tokens, replacing the token-index `where` of each `TuffError`.
2. Track moves as state threaded through the fold instead of flags on cells, so the evaluator stays a pure fold.
3. Split `src/` into subdirectories by stage before adding an eleventh file.

### Later

1. Add a REPL that prints `TuffError` values in full.
2. Tune size limits in `eslint.config.js`; they are warnings today.
3. Add resource limits (source size, depth, steps) as interpreter options with safe defaults.

## Performance

### Parsing and evaluation

- Tokenizing and parsing should be linear in source length. Avoid regular expressions with nested quantifiers.
- Statement-block detection scans forward to the matching `}`, so nested blocks can cost source length times depth.

### Scope and loops

- Scope lookup walks bindings in order, so many `let` statements can make evaluation quadratic. A map by name avoids this.
- Step limits will guard unbounded loops, which the language will eventually need.

### Arrays

- A nested read copies one level, so reading a row costs the row's length. Large grids may need a persistent structure.

### Measurement

- Real measurements should come from a profiler once the pipeline exists. No optimization is planned before then.
