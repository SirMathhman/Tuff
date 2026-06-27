---
description: Tuff is a minimal programming language interpreter written in JavaScript (ESM) on Bun. This file helps AI agents understand the project conventions, architecture, and development workflow.
---

# Tuff — Minimal Language Interpreter

## Quick Start

- **Run tests**: `bun test`
- **Run with coverage**: `bun test --coverage` (threshold: 100%, configured in `bunfig.toml`)
- **Pre-commit hook**: `.github/hooks/test.ps1` runs tests and checks for uncovered lines; a PMD CPD duplicate detection also runs

## Architecture

The entire interpreter lives in `index.js` as a single recursive-descent parser/evaluator exported as `execute(source)`.

### Key Concepts

- **Tokenizer**: Regex-based, produces flat token array (numbers, strings with escapes, operators including `||`, `&&`, `<=`, `>=`, `==`, `!=`, `=>`, `+=`, `..`, delimiters, identifiers/keywords)
- **Parser/Evaluator**: Recursive descent with explicit precedence — `parseOrExpr` → `parseAndExpr` → `parseComparisonExpr` → `parseExpr` (add/sub) → `parseTerm` (mul/div) → `parseFactor` (literals, grouping, variables, function calls)
- **Scope**: Block-scoped via `scopeStack` array; inner blocks shadow outer declarations. Variables are immutable by default (`let x = ...`), mutable with `let mut x = ...`
- **Block vs Object Literal**: `{ }` is disambiguated by lookahead — if the first token pair inside braces matches `identifier :`, it's an object literal; otherwise it's a block scope
- **Functions**: Declared with `fn name(params) => expr`. Bodies are stored as token-range references (`bodyStart`/`bodyEnd`) and evaluated lazily via `evalBody()` in isolated scopes
- **Conditionals**: `if (cond) then else other` — can be used as expressions or statements. Semicolon before `else` is supported: `if (false) x = 3; else x = 5;`
- **Loops**: `while (cond) stmt`, `for (i in start..end) stmt`
- **Chaining**: Array index `[expr]` and property access `.prop` can be chained on any expression result

### Conventions

- Tests live in `index.test.js` — add new feature tests here with descriptive titles like `'execute("...") => result'`
- **Test-driven**: Always write the failing test case _before_ implementing the feature
- All boolean results normalize to `1` (true) / `0` (false)
- Empty or whitespace-only input returns `0`
- Errors throw `"Invalid source: " + source`
- **Debugging**: Don't overthink — add temporary `console.log()` statements for faster debugging when stuck
- **Infinite loops**: If you encounter an infinite loop during development, add a hard cap of 1024 iterations to break out and diagnose the issue

### Hooks

See `.github/hooks/hooks.json` — the `Stop` hook runs tests and PMD CPD duplicate detection before the agent stops. Ensure all changes pass these checks.
