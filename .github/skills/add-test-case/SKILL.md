---
name: add-test-case
description: 'Add and implement a single tuffness test case (TDD). Use when: the user asks to add a test case, implement a test, or add support for a language feature via a test like evaluateTuff("...") => X. One test per invocation.'
argument-hint: 'The test case, e.g. evaluateTuff("return 100U8;") => 100'
---

# Add and Implement a Test Case

TDD workflow for adding one tuffness test case: write the failing test first, then implement the minimal change to make it pass.

## When to Use

- The user provides a test case in the form `evaluateTuff("<source>") => <value>` (or `=> Err`).
- The user asks to "add support for" a language feature — derive the test case from the request, confirm it with the user if ambiguous, then proceed.

## Procedure

1. **Write the failing test first.**
   - Name it exactly: `test('evaluateTuff("<source>") => <value>', ...)` — the test name is the spec.
   - Pick the file by feature area: `src/core.test.ts` (literals, suffixes, `is` type-tests, references), `src/expressions.test.ts` (operators, tuples, arrays), `src/control-flow.test.ts` (if/while/for/break/continue).
   - Success case: `expect(evaluateTuff("<source>")).toEqual({ ok: true, value: <value> });`
   - Error case: use an `expect*` helper from `src/test-helpers.ts` if one exists for the error kind; otherwise `toEqual` the full error object `{ ok: false, error: { kind, ..., line } }`.
   - Run `bun run test` and confirm the new test fails for the right reason.

2. **Implement the minimal change.**
   - Follow the pipeline order: tokenizer → parser → typechecker → evaluator. The typechecker is the sole source of semantic errors; the evaluator must stay a pure executor (no semantic checks, no new error returns).
   - Respect the conventions in `AGENTS.md`: errors are values, no classes, no inline type literals, mandatory JSDoc, 300-line/50-line limits, mutual recursion broken by passing functions as parameters.
   - If the change is structural (new module, new AST node, new error kind), update the architecture memory at `/memories/repo/architecture.md` to match.

3. **Verify.**
   - `bun run test` — all tests pass (including the new one).
   - `bun run lint` — clean.
   - The Stop hooks also run `pmd:cpd`, the callgraph tool, and `madge:circular`; make sure all five pass before concluding.

4. **Commit.**
   - Imperative, specific subject, one logical change: `Add reference type-tests: &x is &Suffix`, `Add test: (1U8 < 2U8) is Bool folds to 1`.
   - Commit the regenerated `docs/callgraph.dot` / `.svg` if the graph changed.

5. **Reviewer.**
   - If the user asked to run the reviewer (or the change introduced new functionality), launch the architectural-review subagent per the `subagent-analysis` skill and implement its recommendation if the score is greater than 5, committing with a `(reviewer fix)` suffix.

## Pitfalls

- Booleans render as 1/0 in the public result; tuples/arrays render as their element count.
- Line numbers in errors are currently statement indices, not source lines.
- `bun run test` can segfault at shutdown on Windows after all tests pass — re-run before treating it as a failure.
