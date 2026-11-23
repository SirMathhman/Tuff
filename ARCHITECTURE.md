# Tuff Architecture

The ideal architecture for Tuff: a small, pure, layered interpreter whose failures are structured values, not exceptions or silent coercions.

## Definitions

- **Source**: the text of a Tuff program, always an untrusted string.
- **Interpreter entry point**: `interpretTuff(source)`. Target signature: `Result<Value, TuffError>`. It is the only public function of the interpreter.
- **Value**: the result of evaluating a program. Currently numbers only.
- **Result**: a tagged union (`ok` or `err`). Used instead of throwing.
- **TuffError**: a structured error enum. Each variant answers: what it is, where the cause is (span), why it is an error, and what the user can do about it.
- **Pure core**: the interpreter performs no I/O, no dynamic code evaluation, and reads no ambient state.

## Structure

Dependency direction is strictly downward. No module imports from a module above it, and no cycles exist (verified by a circular-dependency check in CI).

1. Entry points: REPL and file runner. They read input and print output. They are the only layer allowed to do I/O.
2. Public API: `interpretTuff` and its types, re-exported from `index.ts`.
3. Pipeline: tokenizer, then parser (producing an AST), then evaluator. Each stage is a separate file with a pure function signature.
4. Shared core: `Result`, `TuffError`, `Span`, and `Value` types. These depend on nothing else.
5. Tests live beside the code they cover (`*.test.ts`) and exercise the public API first, the stages second.

Recursion is limited to the parser and evaluator over the AST. Mutual recursion between stages is forbidden; a stage receives the next stage as a parameter when it needs to call back.

## Potential Problems

- Silent coercion: `Number(source)` accepts empty and whitespace-only strings (as 0), hex (`0x1F`), and exponents, and returns `NaN` for everything else. None of this is reported as an error.
- Dependency on JavaScript number syntax: the language grammar is currently JavaScript's, so changing it later is a breaking change.
- Unbounded input: very large sources and deeply nested expressions can exhaust time or the call stack.
- Exception-based failure paths will creep in unless the Result pattern is enforced from the start.

## Security Concerns

Source is untrusted input. It arrives from the REPL, from files, and potentially from a model that writes Tuff code.

Controls the architecture requires:
- No `eval`, `Function`, or dynamic import of anything derived from source.
- The interpreter has no access to the filesystem, network, process, or globals. Any host capability must be passed in explicitly and is absent by default.
- Limits on source size, nesting depth, and evaluation steps, so that hostile input cannot hang or crash the host.
- Output is data only. Values are never rendered as markup or executed by the caller.

Known gaps: none of these controls exist yet. No size, depth, or step limits are enforced. If Tuff is later driven by model output, prompt injection can reach the evaluator through source text, so the host-capability whitelist is the only defense and must be designed before any host function is added.

## Future Work

- Replace `Number(source)` with a real tokenizer, parser, and evaluator returning `Result`.
- Introduce the `TuffError` enum with span information and actionable messages.
- Add a REPL that prints `TuffError` values in full.
- Enforce file, function, and directory size limits through lint configuration, plus the circular-dependency check.
- Add resource limits (source size, depth, steps) as explicit interpreter options with safe defaults.

## Performance

- Tokenizing and parsing should be linear in source length. Avoid regular expressions with nested quantifiers, which backtrack badly on adversarial input.
- Evaluation step limits protect against unbounded loops, which the language will eventually need.
- Real measurements should come from a profiler once the pipeline exists; no optimization is planned before then.
