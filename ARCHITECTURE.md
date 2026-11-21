# Tuff Architecture

This is the entry point for the architecture of Tuff, a small statically typed language interpreted in TypeScript. It describes the architecture the project is working toward. Completed work is in the git log, not here.

Related documents:

- [README.md](README.md): install and run instructions.
- [docs/language.md](docs/language.md): what a Tuff program means. This document covers how the interpreter is built, not the language's rules.
- [docs/security.md](docs/security.md): trust boundaries, untrusted input, and the controls the interpreter should have. It owns the status of each control.

## Overview

A Tuff program is a string. `interpretTuff` (index.ts) parses and evaluates it in one pass: there is no separate AST and no separate evaluation phase. Each parse function consumes characters from a `Cursor` and returns a `Result<Value, Problem>`. Statements, loops, and branches are evaluated as they are parsed. Branches that are not taken are parsed in a "dead" or "suppressed" mode so that their syntax is still checked.

Multi-module programs go through `interpretModules` (modules.ts), which loads each module once, links `expect`/`actual` pairs, and runs the entry module.

Errors are values, never exceptions. Every failure is a `Problem` (an offset plus what was expected) that is turned into a message at the public boundary.

## Definitions

- **Value**: a runtime value (`src/types.ts`): an integer with a type name, a boolean, a reference, an array, or a struct value.
- **Type**: the type of a value or declaration, identified by a name. The target design is a discriminated union (see Future Work). Until then a type is a string such as `I32`, `Bool`, `[I32; 3]`, `&mut Bool`, or `Wrapper<I32>`.
- **Scope**: a chain of frames (`src/scope.ts`), each holding bindings, functions, struct definitions, type aliases, and namespaces. Lookup walks the parent chain. A scope that is the top level of a module or the body of a namespace or object is an **export scope**: it has an `exports` map, and `out` declarations write to it. No other scope has one.
- **Export**: a value a module, namespace, or object makes reachable from outside by declaring it with `out`. `out` is valid only at the top level of a module or in the body of a namespace or object.
- **Namespace**: a declaration in a scope that holds the exports of a namespace body. Its exports are read as `Name::member`. The namespace's rules are in docs/language.md (Namespaces).
- **Object**: a declaration in a scope that binds a variable whose value is a struct of the exports of its body. Its exports are read as `Name.member`, like a module's. Its `out fn` functions are called as `Name.fn();` and are stored on the struct value. Its `out let mut` fields are read through the struct's `cells`, which point at the body's live bindings. The object's rules are in docs/language.md (Objects).
- **Cursor**: the read position in the source plus the current scope, call depth, and dead/break state. It is the only mutable state a parse function receives.
- **Problem**: a structured parse or evaluation failure: the `offset` in the source and the `expected` description. It is rendered by `describeUnsupported` (src/lexing.ts) into a message that says what the problem is, where it is, why it is an error, and what would fix it.
- **Result**: `Ok` or `Err` (`src/result.ts`). Used everywhere instead of exceptions.
- **Struct definition**: a named set of fields with declared types, plus the names of its type parameters (`struct Name<T, ...> { ... }`).
- **Struct instance name**: the canonical string for an instantiated generic struct, such as `Wrapper<I32>`. Two annotations that name the same instance produce the same string, and type checks compare these strings.
- **Type parameter**: a name declared in `<...>` on a generic struct or generic function (`struct Wrapper<T>`, `fn pass<T>`). Inside the declaration it is a type alias for itself while the signature is parsed. In an instance, it is an alias for its type argument.
- **Type arguments**: the types written in `<...>` at a use site (`Wrapper<I32>`, `pass<I32>(1)`). Their count must equal the declaration's type parameter count.
- **Host value / host function**: a value or function supplied by the embedding JavaScript code (`src/host.ts`). The language rules are in docs/language.md (Host values).
- **Module**: a source unit with a path made of segments. A module is either `expect` (declares functions), `actual` (implements them), or plain.

Invariants:

1. A parse function that fails returns a `Problem`; it never throws.
2. A parse function that succeeds leaves the cursor after the syntax it consumed.
3. Type checks compare canonical type strings. A type string is only produced by the annotation parser (`src/parse/annotations.ts`), so it is normalized (aliases are resolved, instance names are canonical).
4. Source text is never executed as JavaScript. The `no-eval`, `no-implied-eval`, and `no-new-func` lint rules enforce this.
5. A name bound to a variable in any enclosing scope is never read as a generic struct or generic function. A `<` after it is a comparison.
6. A name followed by `::` is resolved to a namespace in scope before it is read as a module path (`src/grammar/expression.ts`, `src/parse/imports.ts`). A namespace in scope is never read as a variable.
7. A namespace's exports are fixed when its body finishes: they are the values of the names at that point, and nothing can assign to them from outside. An object's exports are the same, except that an object reads each exported name through its binding (`cells`), so a mutation made by one of its functions is seen by every later read of `Name.field`.
8. A namespace or object name is claimed in its scope before its body is parsed, through the claim functions in `src/scope.ts`. A claim fails if the name is already a variable, namespace, or object in that scope, in either order. A `let` is rejected only when the name is already a namespace in its scope (`src/grammar/statements.ts`). Other declarations (`let` after `let`, `fn`, `struct`, `type`) are not yet checked against earlier names; see Future Work.
9. A declaration whose name claim fails runs no code. Its body is not parsed, so no host call in it can happen.

## Structure

### Layers and dependency direction

Dependencies point downward only. A module may import from modules in the same or lower layers. Cycles between files are not allowed; `bun run circular` (madge) enforces this, and `bun run packages` enforces it between directories.

| Layer             | Location                                                          | Role                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver            | `modules.ts`                                                      | Multi-module loading, `expect`/`actual` linking, module caching                                                                                                       |
| Entry and grammar | `index.ts`, `src/grammar/`                                        | `index.ts`: public `interpretTuff`, builds the `Grammar` record. `src/grammar/`: the expression grammar (`expression.ts`) and the statement grammar (`statements.ts`) |
| Grammar fragments | `src/parse/**`                                                    | One construct each (structs, functions, arrays, annotations, generics, imports, exports (namespaces, objects), postfix, destructuring, hoisting)                      |
| Services          | `src/scope.ts`, `src/lexing.ts`, `src/host.ts`, `src/keywords.ts` | Scopes and type checks, character-level reading, host calls, reserved words                                                                                           |
| Core types        | `src/types.ts`, `src/result.ts`                                   | Shared data shapes and `Result`                                                                                                                                       |

### Rule for recursion

Grammar recursion (an expression contains a block, which contains statements, which contain expressions) must not become a set of file-level imports that point back up. The rule is:

- A grammar fragment in `src/parse/` never imports `index.ts`. When it needs to parse a sub-expression or a type, the caller passes that parser in as a parameter (the existing pattern: `parseArrayLiteral(text, cursor, parseElement)`, `parseStructLiteral(..., parseValue)`; `parseTypeArguments(..., parseType)` in `src/parse/generics.ts`).
- Expressions contain blocks and blocks contain statements, so `src/grammar/expression.ts` cannot import `src/grammar/statements.ts`. The statement entry points are bundled in the `Grammar` record (`src/grammar/grammar.ts`) with two members, `statements` and `statementBlock`. `index.ts` builds the record once. The expression functions take `grammar: Grammar` as their last parameter.
- The direction is one way: `statements.ts` imports `expression.ts` directly, and `expression.ts` reaches statements only through the record. `bun run circular` confirms there is no cycle.
- A namespace body is a statement list, so `src/parse/namespaces.ts` receives its body parser as a callback. The statement grammar supplies that callback, which runs the body in the scope it is given.

### Export model

Exports are recorded in exactly one place: the `exports` map of the current scope. A module's top-level scope, a namespace body, and an object body are all export scopes. The module driver (`interpretModule`, modules.ts) reads a module's exports from its top-level scope, and the cursor holds no export map. Both declaration forms that export (`out let`, in `exportLet`, and `in let ... out`, in `parseInputLet`) write to `scope.exports` and fail when it is undefined. `in` additionally requires the module's top-level scope (depth 0). `out` in any other scope is an error.

### Target file layout

```
index.ts                  public entry: interpretTuff, builds the Grammar record
modules.ts                multi-module driver
src/grammar/grammar.ts    the Grammar record, and helpers shared by the two grammar files
src/grammar/expression.ts sums, terms, factors, blocks, if, match, loop, reference, call
src/grammar/statements.ts let, assignment, compound assignment, dereference assignment, if, while, for, break
src/parse/annotations.ts  type annotations and type aliases; type arguments are passed in as a parser
src/parse/exports/        declarations whose body exports names, one directory per feature (the file count limit applies):
                          exporting.ts is the shared "keyword Name { body }" parser, which takes the body parser as a
                          parameter and the claim and bind rules as callbacks; namespaces.ts is namespace declarations
                          and Name::member access; objects.ts is object declarations and their Name.member reads
src/parse/generics.ts     type parameters and type arguments: parseTypeParameters, parseTypeArguments, parseAngleList,
                          bindTypeParams, newTypeScope, substituteTypeParams, instanceName. Imports no other parse file.
src/parse/                one construct per file (the rest unchanged)
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

- `max-lines` is 1000 for `.ts` files (eslint.config.js, comments and blank lines excluded). Markdown files are not checked by lint yet; keep each document under the same 1000-line bound by hand.
- Functions should be split by grammar construct. A function that handles more than one construct is split before it grows.

## Potential Problems

- **Exponential re-parsing of untaken branches.** Nested statement-level `if` branches are parsed twice (once to skip the dead branch, once to evaluate it) with dry runs (`dryRunStatementIf`, `skipStatementBranch`). Measured: nested depth 8 takes about 0.2 s, depth 12 takes about 55 s. A branch should be parsed once, with the dead flag controlling evaluation only.
- **Stringly typed types.** Types are strings that are built, compared, and rewritten. `substituteTypeParams` (src/parse/generics.ts) substitutes type parameters by applying a regular expression to a type string, and both generic structs (`instantiateFields`, src/parse/structs.ts) and generic functions (`instantiateFunction`, src/parse/functions.ts) depend on it. This is correct only while every type string is canonical and no name is both a type parameter and part of another name in the same string. A structured type is needed.
- **Objects are typed by their name.** An object's value is a struct whose `structName` is the object's name, so the object shares the namespace of struct type names that `typeMatches` (`src/scope.ts`) compares. An object and a struct with the same name can be confused. Objects need a distinct type name or their own value kind; this has no test yet.
- **Namespace names shadow module paths.** A namespace shadows a module path with the same first segment (Invariant 6), so a program that imports `foo::lib` after declaring `namespace foo` gets a namespace error, not a module load.
- **Namespace bodies are copies.** The exports are snapshots taken at `out`. This is correct while nothing can assign through `Name::member`, but it would become a surprise if assignment to exports were ever added.
- **Near-limit directories.** `tests/` contains 10 files, which is the maximum; the next test file in that directory fails `bun run files`.
- **Host exceptions escape the interpreter.** Nothing in `src/host.ts` catches a throwing host function, so the exception escapes `interpretTuff` instead of becoming a `Problem`. The boundary should convert it to a structured error. The risk is tracked in [security.md](docs/security.md).

## Security Concerns

See [docs/security.md](docs/security.md).

## Future Work

- **Structured types.** Replace type strings with a discriminated union (`IntType`, `BoolType`, `ArrayType`, `ReferenceType`, `StructInstance` with a name and type arguments). Canonical names are derived from the union for display only. Substitution of type parameters becomes a structural map, not a regex.
- **Single evaluation per branch.** Parse each branch once, with a dead flag. Remove the dry-run functions.
- **Generic type aliases,** using the same type arguments as generic structs.
- **Unique names per scope.** Extend Invariant 8 to every kind of declaration (functions, structs, type aliases, and each other), with a structured error that names the earlier declaration.
- **Structured errors.** Replace the string returned by `interpretTuff` with an error enum that carries the `Problem` and the module name, so hosts can act on the error without parsing text.
- **Resource budgets.** A single step budget per `interpretTuff` call that counts parsed tokens and loop iterations, so nested loops cannot multiply the limits.

## Performance

These are the concerns that are visible from the design. Use a profiler before optimizing anything.

- Re-parsing of branches (see Potential Problems) is the dominant risk: its cost is exponential in nesting depth.
- Loops are bounded by `MAX_LOOP_ITERATIONS` per loop (the value is in docs/language.md, Limits), but nested loops multiply that bound: two nested loops can run 10^8 steps.
- Recursion depth is bounded by `MAX_CALL_DEPTH` (the value is in docs/language.md, Limits). Each level uses JavaScript stack frames across the grammar cycle, so the JavaScript stack is also a limit.
- Each call to a generic function re-parses the body and allocates a type scope (`instantiateFunction`). A generic function that calls itself multiplies this per level, bounded by `MAX_CALL_DEPTH`.
- Scope lookups walk the parent chain on every name. This is fine at the current size; if programs grow, cache resolved bindings per scope.
- Each `newScope` allocates four maps. A scope created per loop iteration is a cost to watch.
