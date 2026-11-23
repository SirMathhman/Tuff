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

Dependency direction is strictly downward. No cycles exist; `madge --circular` in `lint` enforces this. `for` loops are banned; iterate with `map` and `reduce`.

### Layers

1. Entry points: REPL and file runner. The only layer allowed to do I/O.
2. Public API: `interpretTuff` and its types, re-exported from `index.ts`.
3. Shared core: `Result`, `TuffError`, `Span`, `Value`. Depends on nothing else.

### Stages and tests

1. Pipeline: tokenizer, then parser (AST), then evaluator. One file per stage, each a pure function.
2. Tests live beside their code (`*.test.ts`), exercising the public API first and the stages second.

### Recursion

Recursion is limited to the parser and evaluator over the AST. Mutual recursion between stages is forbidden; a stage receives the next stage as a parameter.

## Potential Problems

### Grammar and numbers

- Narrow grammar: integers joined by `+`, `-`, or `*`, with `*` binding tighter. A single unary `-` may precede a number or a parenthesized group, and parentheses nest. Spaces and tabs separate tokens.
- Numbers are JavaScript doubles: integer literals and intermediate or final results above 2^53 are rejected, so precision is never lost silently.
- Grammar follows JavaScript number syntax; changing it later is breaking.

### Resources and failure modes

- Unbounded input: very large sources and deeply nested expressions can exhaust time or the call stack.
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

None of these controls exist yet: no size, depth, or step limits are enforced. Model-driven prompt injection can reach the evaluator through source text, so the host-capability whitelist must be designed before any host function is added.

## Future Work

### Near term

1. Build an AST in the parser and evaluate it in a separate stage, as Structure describes.
2. Replace the token-index `where` of each `TuffError` with character spans.

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
