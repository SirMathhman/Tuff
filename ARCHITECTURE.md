# Tuff Architecture

This is the entry point for the architecture of Tuff, a small statically typed language interpreted in TypeScript. It describes the architecture the project is working toward. Completed work is in the git log, not here.

Related documents:

- [docs/security.md](docs/security.md): trust boundaries, untrusted input, and the controls the interpreter should have.

## Overview

A Tuff program is a string. `interpretTuff` (index.ts) parses and evaluates it in one pass: there is no separate AST and no separate evaluation phase. Each parse function consumes characters from a `Cursor` and returns a `Result<Value, Problem>`. Statements, loops, and branches are evaluated as they are parsed. Branches that are not taken are parsed in a "dead" or "suppressed" mode so that their syntax is still checked.

Multi-module programs go through `interpretModules` (modules.ts), which loads each module once, links `expect`/`actual` pairs, and runs the entry module.

Errors are values, never exceptions. Every failure is a `Problem` (an offset plus what was expected) that is turned into a message at the public boundary.

## Definitions

- **Program**: a Tuff source string. Its meaning is its final value, a number or a boolean.
- **Value**: a runtime value (`src/types.ts`): an integer with a type name, a boolean, a reference, an array, or a struct value.
- **Type**: the type of a value or declaration, identified by a name. The target design is a discriminated union (see Future Work). Until then a type is a string such as `I32`, `Bool`, `[I32; 3]`, `&mut Bool`, or `Wrapper<I32>`.
- **Scope**: a chain of frames (`src/scope.ts`), each holding bindings, functions, struct definitions, and type aliases. Lookup walks the parent chain.
- **Cursor**: the read position in the source plus the current scope, call depth, and dead/break state. It is the only mutable state a parse function receives.
- **Problem**: a structured parse or evaluation failure: the `offset` in the source and the `expected` description. It is rendered by `describeUnsupported` (src/lexing.ts) into a message that says what the problem is, where it is, why it is an error, and what would fix it.
- **Result**: `Ok` or `Err` (`src/result.ts`). Used everywhere instead of exceptions.
- **Struct definition**: a named set of fields with declared types, plus the names of its type parameters (`struct Name<T, ...> { ... }`).
- **Struct instance name**: the canonical string for an instantiated generic struct, such as `Wrapper<I32>`. Two annotations that name the same instance produce the same string, and type checks compare these strings.
- **Host value / host function**: a value or function supplied by the embedding JavaScript code, declared in Tuff with `declare let` or `declare fn`.
- **Module**: a source unit with a path made of segments. A module is either `expect` (declares functions), `actual` (implements them), or plain.

Invariants:

1. A parse function that fails returns a `Problem`; it never throws.
2. A parse function that succeeds leaves the cursor after the syntax it consumed.
3. Type checks compare canonical type strings. A type string is only produced by the annotation parser (`src/parse/annotations.ts`), so it is normalized (aliases are resolved, instance names are canonical).
4. Source text is never executed as JavaScript. The `no-eval`, `no-implied-eval`, and `no-new-func` lint rules enforce this.

## Structure

### Layers and dependency direction

Dependencies point downward only. A module may import from modules in the same or lower layers. Cycles between files are not allowed; `bun run circular` (madge) enforces this, and `bun run packages` enforces it between directories.

| Layer | Location | Role |
| --- | --- | --- |
| Driver | `modules.ts` | Multi-module loading, `expect`/`actual` linking, module caching |
| Entry and grammar | `index.ts`, `src/grammar/` | `index.ts`: public `interpretTuff`, builds the `Grammar` record. `src/grammar/`: the expression grammar (`expression.ts`) and the statement grammar (`statements.ts`) |
| Grammar fragments | `src/parse/*.ts` | One construct each (structs, functions, arrays, annotations, imports, postfix, destructuring, hoisting) |
| Services | `src/scope.ts`, `src/lexing.ts`, `src/host.ts`, `src/keywords.ts` | Scopes and type checks, character-level reading, host calls, reserved words |
| Core types | `src/types.ts`, `src/result.ts` | Shared data shapes and `Result` |

### Rule for recursion

Grammar recursion (an expression contains a block, which contains statements, which contain expressions) must not become a set of file-level imports that point back up. The rule is:

- A grammar fragment in `src/parse/` never imports `index.ts`. When it needs to parse a sub-expression, the caller passes that parser in as a parameter (the existing pattern: `parseArrayLiteral(text, cursor, parseElement)`, `parseStructLiteral(..., parseValue)`).
- Expressions contain blocks and blocks contain statements, so `src/grammar/expression.ts` cannot import `src/grammar/statements.ts`. The statement entry points are bundled in the `Grammar` record (`src/grammar/grammar.ts`) with two members, `statements` and `statementBlock`. `index.ts` builds the record once. The expression functions take `grammar: Grammar` as their last parameter.
- The direction is one way: `statements.ts` imports `expression.ts` directly, and `expression.ts` reaches statements only through the record. `bun run circular` confirms there is no cycle.

### Target file layout

```
index.ts                  public entry: interpretTuff, builds the Grammar record
modules.ts                multi-module driver
src/grammar/grammar.ts    the Grammar record, and helpers shared by the two grammar files
src/grammar/expression.ts sums, terms, factors, blocks, if, match, loop, reference, call
src/grammar/statements.ts let, assignment, compound assignment, dereference assignment, if, while, for, break
src/parse/                one construct per file (unchanged)
src/types.ts              Value, Type, StructDef, Grammar, Cursor
src/scope.ts              scopes, lookups, type checks
src/lexing.ts             character reading, Problem rendering
src/result.ts             Result
src/host.ts               host calls
src/keywords.ts           reserved words
tests/                    one directory per feature area; no directory over the file-count limit
```

The file count limit (10 files per directory, `scripts/check-file-count.js`) applies to every directory, so new code goes into subdirectories by feature, not into a flat list.

### Size limits

- `max-lines` is 1000 for `.ts` files (eslint.config.js, comments and blank lines excluded). Documents under `docs/` stay under the same 1000-line bound.
- Functions should be split by grammar construct. A function that handles more than one construct is split before it grows.

## Potential Problems

- **Exponential re-parsing of untaken branches.** Nested statement-level `if` branches are parsed twice (once to skip the dead branch, once to evaluate it) with dry runs (`dryRunStatementIf`, `skipStatementBranch`). Measured: nested depth 8 takes about 0.2 s, depth 12 takes about 55 s. A branch should be parsed once, with the dead flag controlling evaluation only.
- **Stringly typed types.** Types are strings that are built, compared, and rewritten. `instantiateFields` in src/parse/structs.ts substitutes type parameters by applying a regular expression to a type string. This is correct only while every type string is canonical and no name is both a type parameter and part of another name in the same string. A structured type is needed.
- **Keyword dispatch on `<` after a struct name.** In `parseFactor` (src/grammar/expression.ts), a name that is a generic struct followed by `<` is parsed as a generic struct literal, but only when no variable of that name is in scope, since structs and variables are separate namespaces. Otherwise `W < 3` would be read as type arguments. Non-generic structs dispatch only on `{`.
- **Near-limit directories.** `tests/` contains 10 files, which is the maximum; the next test file in that directory fails `bun run files`.
- **Host exceptions escape the interpreter.** Host functions are JavaScript and can throw. Nothing in `src/host.ts` catches them, so a throwing host function escapes `interpretTuff` instead of becoming a `Problem`. The boundary should convert host exceptions to structured errors.

## Security Concerns

See [docs/security.md](docs/security.md).

## Future Work

- **Structured types.** Replace type strings with a discriminated union (`IntType`, `BoolType`, `ArrayType`, `ReferenceType`, `StructInstance` with a name and type arguments). Canonical names are derived from the union for display only. Substitution of type parameters becomes a structural map, not a regex.
- **Single evaluation per branch.** Parse each branch once, with a dead flag. Remove the dry-run functions.
- **Generic functions and generic type aliases,** using the same type-argument parsing as generic structs (`parseTypeArguments`, which should move to `src/lexing.ts` or a new `src/parse/generics.ts`, since it is not specific to annotations).
- **Structured errors.** Replace the string returned by `interpretTuff` with an error enum that carries the `Problem` and the module name, so hosts can act on the error without parsing text.
- **Resource budgets.** A single step budget per `interpretTuff` call that counts parsed tokens and loop iterations, so nested loops cannot multiply the limits.

## Performance

These are the concerns that are visible from the design. Use a profiler before optimizing anything.

- Re-parsing of branches (see Potential Problems) is the dominant risk: its cost is exponential in nesting depth.
- Loops are bounded by `MAX_LOOP_ITERATIONS` (10000) per loop, but nested loops multiply that bound: two nested loops can run 10^8 steps.
- Recursion depth is bounded by `MAX_CALL_DEPTH` (100). Each level uses JavaScript stack frames across the grammar cycle, so the JavaScript stack is also a limit.
- Scope lookups walk the parent chain on every name. This is fine at the current size; if programs grow, cache resolved bindings per scope.
- Each `newScope` allocates four maps. A scope created per loop iteration is a cost to watch.
