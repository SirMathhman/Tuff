# Tuff Compiler — Agent Instructions

## Project Overview

Tuff is a small compiled language that transpiles to JavaScript. The compiler has three stages:
1. **Tokenizer** (`tokenize`) — converts source to tokens
2. **Parser** (`parse`) — builds an AST with scoped variables
3. **Code Generator** (`generate`, `generateExpr`) — emits JavaScript

Entry point: `compile(source)` in `index.js`.

## Commands

| Command | Purpose |
|---------|---------|
| `bun test` | Run tests with coverage (threshold: 90%) |
| `npm run cpd` | PMD copy-paste detection (must pass, no duplications) |

## Conventions

- **Test-driven development**: Add tests before implementation. Tests live in `index.test.js`.
- **No code duplication**: `npm run cpd` must pass with zero duplications. Extract helpers to eliminate repeated patterns.
- **Coverage threshold**: 90% line coverage enforced by `bunfig.toml` (`coverageThreshold = 0.90`).
- **Commit hooks**: `.github/hooks/hooks.json` runs `bun test --coverage` and `npm run cpd` on commit (Stop hook). Both must pass.
- **Test helpers**: `expectValid(source, stdIn, expectedExitCode)` and `expectInvalid(source)` are the standard test utilities. Generated code is executed via `new Function("stdIn", generated)`.

## Architecture

- `index.js` — slim entry point, imports from `src/`
- `src/types.js` — type constants (`VALID_SUFFIXES`, `SUFFIX_RANGES`) and utilities (`parseNumberLiteral`, `validateTypeAnnotation`, `inferType`)
- `src/tokenizer.js` — `tokenize(source)` → token array with EOF sentinel
- `src/parser.js` — `parse(tokens)` → `{ statements, variables, functions, structs }`
- `src/generator.js` — `generate()`, `generateExpr()` → JavaScript code string
- `index.test.js` — test suite using Bun's test runner
- `bunfig.toml` — test configuration (coverage settings)
- `.github/hooks/hooks.json` — pre-commit hooks

### Module Dependencies

```
index.js → tokenizer.js → types.js
          parser.js   → types.js
          generator.js (no imports, pure AST→code)
```

### Parser Pattern

- `parseStatement(parser, variables)` — shared helper for top-level and block-level statement parsing
- `parseBlock(parser, parentVariables)` — block expressions with scoped variables (no shadowing allowed)
- Variables are tracked in a `Map` passed through the parse tree

### Code Generation

- Block expressions compile to IIFEs: `(() => { ...; return val; })()`
- Boolean values emit as `1` (true) / `0` (false)
- Type annotations validated at compile time, not runtime

## Pitfalls

- **ASI gotcha**: Never generate `return \n /* comment */ ...` — ASI treats it as `return;`
- **Parser queue**: If the parser emits queued statements, EOF loops must drain the queue
- **Hook typo**: The hooks config uses `npm` (not `npn`) — a past typo caused silent hook failures
- **CPD hook**: Pre-existing duplication blocks commits. Run `npm run cpd` before committing.

## Memory Notes

See `/memories/` for persistent debugging tips and learned patterns.
