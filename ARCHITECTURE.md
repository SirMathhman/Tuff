# Tuff Architecture

The ideal architecture: a small, pure, layered interpreter whose failures are structured values, not exceptions or silent coercions.

## Definitions

### Program terms

- **Source**: the text of a Tuff program. Always untrusted.
- **Entry point**: `interpretTuff(source)`, the only public function of the interpreter.
- **Value**: the result of evaluating a program. Numbers only for now.

### Errors and purity

- **Result**: a tagged union, `ok` or `err`. Used instead of throwing.
- **TuffError**: a structured enum. Each variant states what failed, where (span), why, and how to fix it.
- **Pure core**: no I/O, no dynamic code evaluation, no reads of ambient state.

## Structure

Dependency direction is strictly downward. No cycles exist; `madge --circular` in `lint` enforces this. `for` loops are banned; prefer `map` and `reduce`, using `while` only where a parse must read ahead.

### Layers

1. Entry points: REPL and file runner. The only layer allowed to do I/O.
2. Public API: `interpretTuff` and its types, re-exported from `index.ts`.
3. Shared core (`errors.ts`): `Result`, `TuffError`, `Span`, `Value`. Depends on nothing else.

### Stages and tests

1. Pipeline: `tokenizer.ts`, then `parser.ts` (AST), then `evaluator.ts`. Each stage is a pure function.
2. Tests live beside their code (`*.test.ts`), exercising the public API first and the stages second.

### Recursion

Recursion is limited to the parser and evaluator over the AST. Mutual recursion is forbidden, within a file and across files: a rule that would close a cycle receives the other rule as a parameter. The evaluator never runs during parsing.

## Potential Problems

### Grammar and numbers

- Narrow grammar: integers joined by `+`, `-`, or `*`, with `*` binding tighter. A single unary `-` may precede a number or a group, and groups nest. A group is `( )` or `{ }`, each closed by its own bracket. Spaces and tabs separate tokens. Names bind with `let name = expr;` at top level or inside braces, ending in a final expression: the last declaration wins, inner blocks shadow outer names, and undeclared names are errors.
- Numbers are JavaScript doubles: integer literals and intermediate or final results above 2^53 are rejected, so precision is never lost silently.
- Grammar follows JavaScript number syntax; changing it later is breaking.

### Resources and failure modes

- Unbounded input: very large sources and deeply nested expressions can exhaust time or the call stack.
- Stack exhaustion is prevented by a nesting limit of 1000 levels, which returns a `NestingTooDeep` error instead of a thrown `RangeError`.
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

Nesting depth is limited to 1000 levels; source size and step limits are not enforced yet. Model-driven prompt injection can reach the evaluator through source text, so the host-capability whitelist must be designed before any host function is added.

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
- Step limits will guard against unbounded loops, which the language will eventually need.

### Measurement

Real measurements should come from a profiler once the pipeline exists. No optimization is planned before then.
