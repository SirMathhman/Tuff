---
description: Tuff is a minimal programming language interpreter written in JavaScript (ESM) on Bun. This file helps AI agents understand the project conventions, architecture, and development workflow.
---

# Tuff — Minimal Language Interpreter

## Quick Start

- **Run tests**: `bun test`
- **Run with coverage**: `bun test --coverage` (threshold: 100%, configured in [`bunfig.toml`](./bunfig.toml))
- **Pre-commit hook**: `.github/hooks/test.ps1` runs tests and checks for uncovered lines; a PMD CPD duplicate detection also runs

## Architecture

The entire interpreter lives in `index.js` as a single recursive-descent parser/evaluator exported as [`execute(source)`](./index.js).

### Key Concepts

- **Tokenizer**: Regex-based, produces flat token array (numbers, strings with escapes — both `"..."` and `'...'`, operators including `||`, `&&`, `<=`, `>=`, `==`, `!=`, `=>`, `+=`, `..`, delimiters, identifiers/keywords)
- **Parser/Evaluator**: Recursive descent with explicit precedence — `parseOrExpr` → `parseAndExpr` → `parseComparisonExpr` → `parseExpr` (add/sub) → `parseTerm` (mul/div) → `parseFactor` (literals, grouping, variables, function calls)
- **Scope**: Block-scoped via `scopeStack` array; inner blocks shadow outer declarations. Variables are immutable by default (`let x = ...`), mutable with `let mut x = ...`
- **Block vs Object Literal**: `{ }` is disambiguated by lookahead — if the first token pair inside braces matches `identifier :`, it's an object literal; otherwise it's a block scope
- **Functions**: Declared with `fn name(params) => expr`. Bodies are stored as token-range references (`bodyStart`/`bodyEnd`) and evaluated lazily via `evalBody()` in isolated scopes
- **Conditionals**: `if (cond) then else other` — can be used as expressions or statements. Semicolon before `else` is supported: `if (false) x = 3; else x = 5;`
- **Loops**: `while (cond) stmt`, `for (i in start..end) stmt` (range is exclusive of end, e.g., `0..4` yields `[0,1,2,3]`)
- **Chaining**: Array index `[expr]` and property access `.prop` can be chained on any expression result. String `.length` is a built-in property
- **Assignments**: `x = expr` for mutable vars, `x += expr` compound assignment, indexed assignment `arr[i] = val` and `arr[i] += val`

### Conventions

- Tests live in [`index.test.js`](./index.test.js) — add new feature tests here with descriptive titles like `'execute("...") => result'`
- **Test-driven**: Always write the failing test case _before_ implementing the feature. The `this.x` test (line ~249 of index.test.js) is a known gap awaiting implementation.
- All boolean results normalize to `1` (true) / `0` (false). Numbers are integers by default; division truncates toward zero.
- Empty or whitespace-only input returns `0`. Errors throw `"Invalid source: " + source`.
- **Debugging**: Don't overthink — add temporary `console.log()` statements for faster debugging when stuck. Use the token array (`tokens`) and position pointer (`pos`) to trace parsing progress.
- **Infinite loops**: If you encounter an infinite loop during development, add a hard cap of 1024 iterations (already in place at line ~589) to break out and diagnose the issue.

### Implementation Details Worth Knowing

- Function bodies are stored as token-range references (`bodyStart`/`bodyEnd`) on function entries; `evalBody()` re-parses from those positions with a fresh scope
- The for-loop body is **re-parsed** each iteration (not pre-evaluated), so the loop variable's value updates in-place via `assign(loopVar, v)` before re-entry
- Block scopes (`{ ... }`) push/pop onto `scopeStack`; object literals are disambiguated by lookahead checking for `identifier :` pattern

### Hooks

See `.github/hooks/hooks.json` — the `Stop` hook runs tests and PMD CPD duplicate detection before the agent stops. Ensure all changes pass these checks:

- **Coverage**: 100% threshold (configured in [`bunfig.toml`](./bunfig.toml))
- **PMD CPD**: Detects code duplication across `index.js` and `index.test.js`; refactor duplicated patterns

### Key Files

| File                               | Purpose                                                       |
| ---------------------------------- | ------------------------------------------------------------- |
| [`index.js`](./index.js)           | Entire interpreter: tokenizer, parser/evaluator in one file   |
| [`index.test.js`](./index.test.js) | Test suite — add new tests here for every feature             |
| `bunfig.toml`                      | Coverage threshold config (100%)                              |
| `.github/hooks/test.ps1`           | Pre-commit: runs coverage check + PMD CPD duplicate detection |

### Related Customizations to Consider Next

- **Agent**: A specialized agent for writing new Tuff language features with the full test-driven workflow baked in. See `/create-agent …`.
