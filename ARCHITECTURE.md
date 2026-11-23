# Tuff Architecture

The ideal architecture: a small, pure, layered interpreter whose failures are structured values, not exceptions or silent coercions.

## Definitions

### Program terms

- **Source**: the text of a Tuff program. Always untrusted.
- **Entry point**: `interpretTuff(source)`, the only public function of the interpreter.
- **Value**: a number or a boolean. A program evaluates to a number; a boolean result is returned as 1 or 0.
- **Binding**: a name paired with a value, introduced by `let`. A `let mut` binding can be reassigned with `name = expr;`.
- **Scope**: the bindings visible at a point, innermost first. Inner blocks shadow outer names; the last declaration wins.
- **Block**: a body of bindings followed by a result expression.

### Errors and purity

- **Result**: a tagged union, `ok` or `err`. Used instead of throwing.
- **TuffError**: a structured enum. Each variant states what failed, where (span), why, and how to fix it.
- **Pure core**: no I/O, no dynamic code evaluation, no reads of ambient state.

## Structure

Dependency direction is strictly downward. No cycles exist; `madge --circular` in `lint` enforces this. `for` loops are banned; prefer `map` and `reduce`, using `while` only where a parse must read ahead.

### Layers

1. Entry points: REPL and file runner. The only layer allowed to do I/O.
2. Public API: `interpretTuff` and the types it returns, exported from `index.ts`. Constructor helpers such as `ok` and `undefinedNameAt` stay internal.
3. Shared core (`errors.ts`): `Result`, `TuffError`, `Span`, `Value`. Depends on nothing else.

### Stages and tests

1. Pipeline: `tokenizer.ts`, then `parser.ts` (expressions), then `statements.ts` (statement lists, blocks, and if statements), then `evaluator.ts`. `conditions.ts` holds the shared `( expr )` condition rule. Parse-error constructors and position helpers live in `parse-errors.ts`. `statements.ts` and `conditions.ts` import only `parse-errors.ts`, `ast.ts`, and each other; they receive the expression rule as a parameter. `parser.ts` imports them, so no parser module imports the expression parser, and no cycle forms. Each stage is a pure function of its input. The evaluator's assignment cells are created and discarded within one evaluation and never escape it.
2. AST types live in `ast.ts`, so the evaluator depends on the AST rather than on the parser.
3. Tests live beside their code (`*.test.ts`), exercising the public API first and the stages second.

### Recursion

Recursion is limited to the parser and evaluator over the AST. Mutual recursion is forbidden, within a file and across files: a rule that would close a cycle receives the other rule as a parameter. Helpers that need the evaluator, such as block evaluation, receive it the same way. The evaluator never runs during parsing.

## Potential Problems

### Grammar and numbers

- Narrow grammar: integers joined by `+`, `-`, or `*`, with `*` binding tighter. `if (cond) a else b` takes a boolean condition and requires both branches; when both branches are statement blocks, the if is a statement with no value; `true` and `false` are booleans. A single unary `-` may precede a number, a name, or a group, and groups nest. A group is `( )` or `{ }`, each closed by its own bracket.
- Brackets, operators, `=`, and `;` are self-delimiting tokens, so spacing never changes meaning. Spaces, tabs, and newlines separate tokens.
- Names bind with `let`, or `let mut` to allow later assignment. Undeclared names and assignments to immutable names are errors. A block used as a value always ends in a final expression; a program made only of statements evaluates to 0. A `{` at statement position opens a statement block, which needs no result of its own, when its contents begin with a statement and the token after its `}` is a name, number, `(`, `{`, `let`, `if`, or `}`, or the `}` ends the input and directly follows a `;`.
- Numbers are JavaScript doubles: integer literals and intermediate or final results above 2^53 are rejected, so precision is never lost silently.
- Number literals will follow JavaScript number syntax. Widening the grammar is additive; narrowing it is breaking.

### Resources and failure modes

- Unbounded input: very large sources and deeply nested expressions can exhaust time or the call stack.
- Every nested construct counts toward one nesting limit of 1000 levels: groups, statement blocks, and if branches alike. Exceeding it returns a `NestingTooDeep` error, so no `RangeError` escapes.
- Operator chains are folded with `reduce`, so their length never depends on the call stack.
- Exception-based failure paths will creep in unless the Result pattern is enforced from the start.

## Security Concerns

Source is untrusted input. It arrives from the REPL, from files, and potentially from a model that writes Tuff code.

### Code execution and host access

- No `eval`, `Function`, or dynamic import of anything derived from source.
- No filesystem, network, process, or global access. Host capabilities are passed in explicitly and absent by default.

### Limits and output

- Limits on source size, nesting depth, and evaluation steps, so hostile input cannot hang or crash the host.
- Output is data only. Values are never rendered as markup or executed by the caller.

### Known gaps

Nesting depth is counted for every nested construct; source size and step limits are not enforced yet. Model-driven prompt injection can reach the evaluator through source text, so the host-capability whitelist must be designed before any host function is added.

## Future Work

### Near term

1. Replace the token-index `where` of each `TuffError` with character spans.

### Later

1. Add a REPL that prints `TuffError` values in full.
2. Tune size limits in `eslint.config.js`; they are warnings today.
3. Add resource limits (source size, depth, steps) as interpreter options with safe defaults.

## Performance

### Parsing and evaluation

- Tokenizing and parsing should be linear in source length. Avoid regular expressions with nested quantifiers, which backtrack badly on adversarial input.
- Statement-block detection scans forward to the matching `}`, so nested statement blocks can cost roughly source length times depth. Matching brackets should be found in one pass before parsing.
- Step limits will guard against unbounded loops, which the language will eventually need.
- Scope lookup walks the bindings in order, so a long run of `let` statements can make evaluation quadratic. A map keyed by name avoids this.

### Measurement

Real measurements should come from a profiler once the pipeline exists. No optimization is planned before then.
