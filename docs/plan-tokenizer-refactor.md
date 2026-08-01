# Plan: Refactor the Tokenizer into Dispatched Scanner Helpers

## Goal

Break the monolithic `tokenize` loop in `src/tokenizer.ts` into a small set of focused scanner helpers, each responsible for one lexical rule, driven by a single dispatch. This keeps the ordering rules between rules localized, makes each rule independently testable, and matches the existing factory-function style (`createScope`, `createParser`) already used in the codebase — avoiding a "big ball of mud" tokenizer as more lexical features accumulate.

## Current State (verified)

`tokenize(source)` is a single `while (i < source.length)` loop with many sequential `if`/`continue` branches, in this order:

1. **Whitespace** — skip ` `, `\t`, `\n`, `\r`.
2. **Line comment** `//` — consume to (not including) `\n`.
3. **Block comment** `/* ... */` — consume to `*/`; unterminated → `syntax` error.
4. **Number literal** — digits + optional `.`, then optional type suffix from `SUFFIXES`.
5. **Identifier / keyword** — letters/`_`/`$`, then a hardcoded `if/else` chain mapping names to keyword tokens.
6. **Compound assignment** `+=` (not in `OPERATORS`).
7. **Fat arrow** `=>`.
8. **Operator tokens** — from the centralized `SYMBOL_TO_TYPE` lookup (built from `OPERATERS`).
9. **Single-character tokens** — `& ( ) { } [ ] . : , = ;` each as its own `if` branch.
10. **Unknown character** — fail loudly with `syntax` error.

### Problems

- **Fragile ordering**: correctness depends on branch order (e.g. comments must precede the operator loop because `/` is an operator; `+=` must precede `=`; `=>` must precede `=`). Adding a new rule means finding the right insertion point and reasoning about interactions with every existing branch.
- **Monolithic**: all rules live in one function with a shared mutable `i` and `tokens`. It's hard to unit-test a single rule in isolation, and the function keeps growing.
- **Repetition**: the single-character token branches are near-identical (`if (char === "X") { push; i++; continue; }`), which is exactly the kind of duplication CPD flags.

## Design

Extract each lexical rule into a small helper that operates on a shared **scanner state** and returns either a token to push or `null` (meaning "not handled here — try the next rule"). A single dispatch loop calls the rules in order.

### Scanner state

Introduce a lightweight scanner object (factory function, no class) that bundles the source, the current index, and the token list:

```ts
interface Scanner {
  source: string;
  i: number;
  tokens: Token[];
}
```

`createScanner(source)` returns `{ source, i: 0, tokens: [] }`. Helpers take the scanner and mutate `scanner.i` / push to `scanner.tokens`, returning `true` if they consumed input (so the loop continues) or `false` if they didn't match.

### Helper signatures

Each helper is a pure-ish function `(s: Scanner) => boolean` (or `Result<boolean, CompileError>` where it can fail, e.g. unterminated block comment):

- `skipWhitespace(s)` — advance past whitespace; returns whether anything was skipped.
- `skipLineComment(s)` — consume `// ...` to `\n`.
- `skipBlockComment(s)` — consume `/* ... */`; returns `Result<boolean, CompileError>` (unterminated → `syntax` error).
- `scanNumber(s)` — digits + optional `.` + optional suffix; pushes a `number` token.
- `scanIdentifier(s)` — letters/`_`/`$`; pushes an `identifier` or keyword token.
- `scanOperator(s)` — matches `+=`, `=>`, then `SYMBOL_TO_TYPE`, then single-char tokens; pushes the token.

### Dispatch

```ts
export function tokenize(source: string): Result<Token[], CompileError> {
  const s = createScanner(source);
  while (s.i < source.length) {
    const handled =
      skipWhitespace(s) ||
      skipLineComment(s) ||
      skipBlockComment(s) ||
      scanNumber(s) ||
      scanIdentifier(s) ||
      scanOperator(s);
    if (!handled) {
      return err(
        compileError("syntax", "Unexpected character: '" + source[s.i] + "'"),
      );
    }
  }
  s.tokens.push({ type: "eof" });
  return ok(s.tokens);
}
```

The `||` short-circuit chain preserves the current ordering semantics while making each rule a named, independently testable unit. The "unknown character" fallback fires only when no rule matched.

### Key decisions

1. **Keep the ordering explicit in the dispatch chain.** The `||` chain documents the precedence of rules at a single glance, and adding a new rule is a one-line change to the chain rather than a hunt for the right insertion point.
2. **`scanOperator` absorbs the single-char branches.** The repetitive `if (char === "X")` blocks collapse into a single `SINGLE_CHAR_TO_TYPE` lookup table (mirroring `SYMBOL_TO_TYPE`), eliminating the CPD-flagged duplication. `+=` and `=>` stay as explicit `startsWith` checks before the table (they're multi-char and not in `OPERATORS`).
3. **Keyword mapping stays a lookup, not a chain.** Replace the hardcoded `if/else` keyword chain in `scanIdentifier` with a `KEYWORDS: Record<string, Token>`-style map (or a `Map`), so adding a keyword is a one-line table entry. (Note: use a `Map` or a named interface — inline object types and `Record` are banned by ESLint.)
4. **No behavior change.** This is a pure refactor. All existing tests (75) must pass unchanged; no new language features are added.
5. **Error behavior preserved.** The "Unexpected character" error and the "Unterminated block comment" error keep their exact messages and `syntax` kind.

## Steps

1. Add `Scanner` interface + `createScanner` factory to `src/tokenizer.ts`.
2. Extract `skipWhitespace`, `skipLineComment`, `skipBlockComment`, `scanNumber`, `scanIdentifier`, `scanOperator` from the existing loop bodies.
3. Add a `SINGLE_CHAR_TO_TYPE` lookup and a keyword `Map` to collapse the repetitive branches.
4. Rewrite `tokenize` as the dispatch loop above.
5. Run `bun test` — all 75 tests must pass.
6. Run `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all must pass.

## Risks / Notes

- **`noUncheckedIndexedAccess`**: `source[s.i]` returns `string | undefined`; the existing code already handles this with `!` and `charCodeAt` guards — preserve those patterns.
- **ESLint restrictions**: no classes (use the factory), no `Record` (use `Map` or a named interface), no inline object types (use named interfaces), no `throw` (use `Result`).
- **CPD**: the refactor should _reduce_ duplication (single-char branches collapse into a table), which is the opposite direction of the CPD hook's concern.
