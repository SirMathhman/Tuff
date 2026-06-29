---
description: Practical development patterns, debugging strategies, and implementation gotchas for Tuff language interpreter. Complements AGENTS.md with actionable guidance.
---

# Development Patterns & Gotchas

## Debugging Strategy

When stuck on a parsing/evaluation bug:

1. **Print the token array** — `console.log(tokens)` shows exactly what was produced from source input
2. **Trace position pointer** — Log `pos` at each parse function entry to see where parsing stops or skips tokens unexpectedly
3. **Check scopeStack state** — Print before/after block scopes to verify push/pop symmetry
4. **Verify token consumption** — After consuming a token, confirm the next one matches expectations

## Common Implementation Gotchas

### Block vs Object Literal Disambiguation

The lookahead checks `tokens[pos+1]` is an identifier AND `tokens[pos+2] === ":"`. This means:

- `{ x : 5 }` → object literal (identifier followed by colon)
- `{ let x = 5; x }` → block scope (keyword not a plain identifier for this check, but still works since "let" is an identifier... see below)

**Critical**: The disambiguation only checks the FIRST token pair. Nested objects inside blocks won't be re-checked — they'll always parse as object literals if `{ key : val }` pattern matches at any depth. This can cause subtle bugs when mixing block scopes and nested objects.

### For-Loop Re-Parsing

The for-loop body is **re-parsed each iteration**, not pre-evaluated once:

```js
for (i in start..end) { ... }  // re-parses the entire body every iteration
```

This means `assign(loopVar, v)` must happen before re-entry. If you modify loop logic, ensure variable assignment occurs at the right point.

### Boolean Normalization

All boolean results normalize to `1` (true) / `0` (false). This applies in:

- Comparison operators (`<`, `>`, etc.) — returns 1 or 0 directly
- Logical AND/OR chains — intermediate results are normalized
- Function return values that evaluate to booleans

**Gotcha**: If you expect a function to return the raw boolean value, it will be converted. Test with `'execute("let x = true; x") => 1'` not `=> true`.

### Function Bodies: Expression vs Block

Functions support two body styles:
- **Expression body**: `fn add(a, b) => a + b` — single expression, no semicolons in body range detection
- **Block body**: `fn get() => { 100 }` — uses depth tracking to find matching closing brace/paren/bracket

When modifying function parsing, remember that block bodies use nested bracket counting (`{`, `(`, `[`) to determine the end position.

### Division Truncation

Integer division truncates toward zero: `8 / 3 === 2`, NOT `2.66...`. This is consistent throughout the interpreter — there's no floating-point arithmetic in this language.

### Scope Traversal with `.super`

When working with captured scopes (`this`), you can traverse outward through scope levels using `.super`:

```tuff
let x = 100; let temp = this; temp.super.x  // accesses outer scope's x
```

Each `.super` decrements the depth counter, moving from innermost to outer scopes. This is used in chained calls like `fn a() => { fn b() => 100; this } a().b()`.

## Test Writing Patterns

Tests follow a strict naming convention that makes them instantly readable:

```js
test('execute("source") => result', () => { ... });
test('execute("source") should throw error', () => { expect(() => execute(...)).toThrow(); });
```

**Key patterns**:

- Always include the full source string in quotes — this is part of the test identity
- Use `=>` for expected results, `should throw error` for exceptions
- Tests are self-contained: each one calls `execute()` independently with no shared state between tests (scopeStack resets per call)

## Error Handling Pattern

All errors use a consistent format: `"Invalid source: " + source`. When adding new validation or fixing bugs, maintain this pattern so error messages remain predictable and testable.
