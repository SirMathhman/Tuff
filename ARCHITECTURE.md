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

- **Value**: a runtime value (`src/types.ts`): an integer with a type name, a boolean, a reference, an array, a struct value, or an object value. An object value is a kind of its own, not a struct value, so it has no struct name that could clash with a struct's. An object value is either an object's or instance's exports (cells and functions included) or a **snapshot** built by bare `this` (values only, no template, no cells, no functions). A snapshot is still an object value and is distinguished only by its `name` (`"this"`), which is for display.
- **Type**: the type of a value or declaration, identified by a name. The target design is a discriminated union (see Future Work). Until then a type is a string such as `I32`, `Bool`, `[I32; 3]`, `&mut Bool`, or `Wrapper<I32>`.
- **Scope**: a chain of frames (`src/scope.ts`), each holding bindings, functions, struct definitions, type aliases, namespaces, and object templates. Lookup walks the parent chain. A scope that is the top level of a module or the body of a namespace or object is an **export scope**: it has one `exports` map, and every `out` declaration writes to it. No other scope has one. The one exception to the parent walk is `this` (see This).
- **Export**: a name a module, namespace, or object makes reachable from outside by declaring it with `out`. `out` is valid only at the top level of a module or in the body of a namespace or object. An export is one of three kinds (`Export` in `src/types.ts`): a **value** (a snapshot, used by modules and namespaces), a **cell** (a binding, used by an object's `out let` fields, so later assignments are seen), or a **function** (used by an object's `out fn`).
- **Namespace**: a declaration in a scope that holds the exports of a namespace body. Its exports are read as `Name::member`. The namespace's rules are in docs/language.md (Namespaces).
- **Object**: a declaration in a scope that binds a variable whose value is an object value holding the exports of its body. Its exports are read as `Name.member`, like a module's. Its `out fn` functions are called as `Name.fn();`. Its `out let` fields are read through their cells. The object's rules are in docs/language.md (Objects).
- **Template**: an object declaration whose body declares an input with `in let`. A template binds no value and runs no code when declared. It is kept in the `templates` map of its scope, and each instance runs its body again. Its rules are in docs/language.md (Templates).
- **Input**: a value given to a template instance for an `in let` declaration in the template's body. The body is the only code that reads inputs.
- **Instance**: the object value built from a template, by `Name { input : value }` or by `&Name { ... }`. It holds the template's name and its inputs, and its exports come from its own run of the body. Instances of one template are the only objects that can compare equal by value (see Invariant 11 and Future Work).
- **Cursor**: the read position in the source plus the current scope, call depth, and dead/break state. It is the only mutable state a parse function receives.
- **Problem**: a structured parse or evaluation failure: the `offset` in the source and the `expected` description. It is rendered by `describeUnsupported` (src/lexing.ts) into a message that says what the problem is, where it is, why it is an error, and what would fix it.
- **Result**: `Ok` or `Err` (`src/result.ts`). Used everywhere instead of exceptions.
- **Struct definition**: a named set of fields with declared types, plus the names of its type parameters (`struct Name<T, ...> { ... }`).
- **Struct instance name**: the canonical string for an instantiated generic struct, such as `Wrapper<I32>`. Two annotations that name the same instance produce the same string, and type checks compare these strings.
- **Type parameter**: a name declared in `<...>` on a generic struct or generic function (`struct Wrapper<T>`, `fn pass<T>`). Inside the declaration it is a type alias for itself while the signature is parsed. In an instance, it is an alias for its type argument.
- **Type arguments**: the types written in `<...>` at a use site (`Wrapper<I32>`, `pass<I32>(1)`). Their count must equal the declaration's type parameter count.
- **Host value / host function**: a value or function supplied by the embedding JavaScript code (`src/host.ts`). The language rules are in docs/language.md (Host values).
- **Module**: a source unit with a path made of segments. A module is either `expect` (declares functions), `actual` (implements them), or plain.
- **This**: a reserved word. `this.name` is not a name lookup: it never walks the parent chain. It refers to the object body that contains it (its exports, Invariant 15), or, outside any object body, to the variables declared directly in the current frame. Bare `this`, with no `.name`, is a **snapshot**: an object value whose exports are the names `this.name` can read at that point, each copied at the read (Invariant 16). The rules are in docs/language.md (This).

Invariants:

1. A parse function that fails returns a `Problem`; it never throws.
2. A parse function that succeeds leaves the cursor after the syntax it consumed.
3. Type checks compare canonical type strings. A type string is only produced by the annotation parser (`src/parse/annotations.ts`), so it is normalized (aliases are resolved, instance names are canonical).
4. Source text is never executed as JavaScript. The `no-eval`, `no-implied-eval`, and `no-new-func` lint rules enforce this.
5. A name bound to a variable in any enclosing scope is never read as a generic struct or generic function. A `<` after it is a comparison.
6. A name followed by `::` is resolved to a namespace in scope before it is read as a module path (`src/grammar/expression.ts`, `src/parse/imports.ts`). A namespace in scope is never read as a variable.
7. A namespace's exports are fixed when its body finishes: they are the values of the names at that point, and nothing can assign to them from outside. An object's `out let` exports are cells, so a mutation made by one of its functions is seen by every later read of `Name.field`. Nothing outside the object can assign to them.
8. A namespace, object, or template name is claimed in its scope before its body is parsed, through the claim functions in `src/scope.ts`. A claim fails if the name is already a variable, namespace, object, or template in that scope, in either order. A `let` is rejected only when the name is already a namespace in its scope (`src/grammar/statements.ts`). Other declarations (`let` after `let`, `fn`, `struct`, `type`) are not yet checked against earlier names; see Future Work.
9. A declaration whose name claim fails runs no code. Its body is not parsed, so no host call in it can happen.
10. A template's body runs only when an instance is built. Each run is in a new scope nested in a snapshot of the scope the template was declared in: the names visible at the declaration, bound to the same cells. A name declared after the template is not visible to its body. The body is parsed and evaluated then, not at declaration, but its scope is fixed at declaration, so the same program reads the same names whenever it is instantiated.
11. An instance is given exactly the inputs its body declares. A missing input, and an input the body does not declare, are each a `Problem` at the instance. Two instances of one template are equal under `==` when each input is equal: a reference input is compared by what it points to, and any other input by identity. Any other pair of objects is equal only when it is the same object.
12. Every nested evaluation counts against `MAX_CALL_DEPTH`: a function call, and an instance built while another instance's body is running, each increase the call depth by one. Exceeding the limit is a `Problem`, never a JavaScript stack overflow.
13. An anonymous binding made by `&Name { ... }` is named `Name@offset`. A source program cannot write that name, so it never clashes with a declared name, and it is visible only in the scope that made it.
14. Whether a body is a template is decided by a token-level scan that skips comments (Tuff has no string literals yet), and that accepts exactly what the statement parser accepts as an `in let` at the body's top level. A body the scan classifies differently from the parser is a bug.
15. `this.name` is resolved against the object body that contains it, not against the frame where it is written. Inside an object body, every frame nested in the body (blocks and expressions included) reads the same exports, so the rule for `this` does not depend on how deeply the read is nested. Outside any object body, `this.name` reads only variables declared directly in the current frame. `this` never reads a name from an enclosing scope, and never reads a name that is not exported from inside an object body.
16. A bare `this` is a snapshot. Its exports are the values of the names `this.name` can read at the moment it is evaluated, copied then, so a later assignment to a variable or an `out let` cell is not seen through it (`this.name` still reads live cells). A snapshot holds no cells and no functions. It is an ordinary object value for escape purposes: its exports are walked by `escapes`, so a snapshot holding a reference to a local cannot leave the frame that declares the local. A snapshot is never an instance, so it has no `template`.

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

Exports are recorded in exactly one place: the `exports` map of the current scope, whatever their kind (value, cell, or function; see Definitions). A module's top-level scope, a namespace body, and an object body are all export scopes. The module driver (`interpretModule`, modules.ts) reads a module's exports from its top-level scope, and the cursor holds no export map. Every declaration that exports writes to `scope.exports` and fails when it is undefined: `out let` (`exportLet`), `out fn` (object bodies only), and `in let ... out` (`parseInputLet`). `in` is valid only at the top level of a module (depth 0) or in an object body, and an object body's `in` declares an input of its template, not an export. `out` in any other scope is an error. An object value is built from its body's `exports` map when the body finishes, and it is the only value that holds cells or functions. A template has no exports until an instance is built; an instance builds its `exports` map the same way an object does.

Exports are read in three places: `Name.member` (`readObjectMember`, src/parse/postfix.ts), `Name::member` (`parseNamespaceMember`, src/parse/namespaces.ts), and `this.member` (`parseThisMember`, src/parse/namespaces.ts). Each reads an export's current value through `exportedValue` (src/scope.ts), and a function is never read as a value. The rule for an unexported name or a function is the same in all three; see Future Work for the single reader that will enforce it.

Bare `this` (`thisSnapshot`, src/parse/namespaces.ts) builds a snapshot object from the same names that `this.member` can read, so it is a fourth reader of the same rule. Until the single reader exists, `thisSnapshot` and `parseThisMember` must select the readable names the same way.

Postfix reads (`.name` and `[index]`, `parsePostfix` in src/parse/postfix.ts) apply to any factor that yields a value, including a call's result (`withFieldAccess`, src/grammar/expression.ts). `parsePostfix` is the one place these reads are parsed, so a new postfix form applies to call results too. This is the intended surface, recorded in docs/language.md (Functions).

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
                          and Name::member access; objects.ts is object declarations, their Name.member reads, "out fn"
                          declarations, and Name.fn(); calls. Templates are declared here too: the template scan, the instance parser (`Name { ... }`),
                          and `&Name { ... }` (its anonymous binding). The "out" dispatch stays in src/parse/imports.ts.
src/parse/generics.ts     type parameters and type arguments: parseTypeParameters, parseTypeArguments, parseAngleList,
                          bindTypeParams, newTypeScope, substituteTypeParams, instanceName. Imports no other parse file.
src/parse/                one construct per file (the rest unchanged)
src/types.ts              Value, Export, ObjectValue, Type, StructDef, Grammar, Cursor
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
- **The file count limit is reached in `src/parse/`.** It holds 10 files, the maximum, so the next file added there fails `bun run files`. The `src/parse/exports/` split in Target file layout is the way out.
- **Namespace names shadow module paths.** A namespace shadows a module path with the same first segment (Invariant 6), so a program that imports `foo::lib` after declaring `namespace foo` gets a namespace error, not a module load.
- **Namespace bodies are copies.** The exports are snapshots taken at `out`. This is correct while nothing can assign through `Name::member`, but it would become a surprise if assignment to exports were ever added.
- **Near-limit directories.** `tests/` contains 10 files, which is the maximum; the next test file in that directory fails `bun run files`.
- **Template inputs compare with `===`.** `pointeesEqual` (src/scope.ts) compares instance inputs with `===`. Numbers and booleans compare by value, but a reference input compares by identity: `&Box { r : &a } == &Box { r : &b }` is `0` even when `a` and `b` hold the same number, while `&a == &b` is `1`. Invariant 11 requires the rule for each input's type.
- **Template names can be shadowed silently.** A `let` with a template's name is accepted (Invariant 8 covers only namespaces, objects, and templates against each other). After `let Box = 5;`, `Box` reads the variable and `Box { ... }` no longer builds an instance.
- **Templates are classified by a character scan.** `declaresInputs` (src/parse/namespaces.ts) decides whether a body is a template by scanning characters and skipping only comments. It is a second grammar for `in let`. Tuff has no string literals today; when they are added, the scan must skip them too (Invariant 14), or a `"}"` ends the scan early.
- **Template bodies are parsed again for every instance.** Each instance re-parses the body text (`parseBody`), so the cost grows with the number of instances and with their nesting.
- **Two readers of the readable-name rule for `this`.** `thisSnapshot` and `parseThisMember` (src/parse/namespaces.ts) each branch on the nearest export scope and, outside an object body, on the frame's variables with `unreadable`. A change to one that is not made to the other makes bare `this` and `this.name` disagree. This is the first item the single reader in Future Work removes.
- **Bare `this` copies every readable name.** Each evaluation of bare `this` copies the exports (or the variables) of its owner, so `this` inside a loop costs time proportional to the number of names, and it freezes `out let` cells at that moment. Code that expects `this` to see a later change must read `this.name` instead.
- **Decided: `this` in a namespace body reads private names.** Namespace bodies do not set `objectBody`, so `namespace N { let p = 1; out let g = this.p; }` makes `N::g` equal to 1. This is kept on purpose, and docs/language.md (This) records it. Only object bodies restrict `this` to their exports.
- **`this.f` for an `out fn` says the name is not exported.** `parseThisMember` reports "no f is exported" when `exportedValue` returns undefined, which is also what a function gives. `readObjectMember` says "a function is called, not read" for the same case. The error should say the same thing in both places.
- **`this` is parsed in the wrong file.** `parseThisMember` lives in `src/parse/namespaces.ts`, but its non-object branch is a variable read, the same as `parseUnboundName` in `src/parse/imports.ts`. The file name does not describe the code. It should move with the variable read; `src/parse/` is at the file count limit, so the move goes into `src/parse/imports.ts` or a subdirectory.
- **Host exceptions escape the interpreter.** Nothing in `src/host.ts` catches a throwing host function, so the exception escapes `interpretTuff` instead of becoming a `Problem`. The boundary should convert it to a structured error. The risk is tracked in [security.md](docs/security.md).

## Security Concerns

See [docs/security.md](docs/security.md).

## Future Work

- **Calls to object functions as values.** `Name.fn(...)` is supported only as a Void statement. Allowing it in expressions needs a return value and a type check against the declared return type.
- **Structured types.** Replace type strings with a discriminated union (`IntType`, `BoolType`, `ArrayType`, `ReferenceType`, `StructInstance` with a name and type arguments). Canonical names are derived from the union for display only. Substitution of type parameters becomes a structural map, not a regex.
- **Single evaluation per branch.** Parse each branch once, with a dead flag. Remove the dry-run functions.
- **Generic type aliases,** using the same type arguments as generic structs.
- **One rule for reference equality.** `valuesEqual` (src/scope.ts) compares references to numbers and booleans by value, and references to arrays, structs, and objects by identity of the pointee. The language should pick one rule. Identity for aggregates is the proposed rule, because it matches how an object is a single named value. Decide this before any structured equality is added, and record the decision in docs/language.md (Equality). Template instances are the exception that must be resolved with this rule: they compare by input, which is value equality for objects. Either the rule admits that case, or template inputs are restricted to numbers and booleans until it does.
- **Template body parsed once.** Parse a template body once into a checked form against its snapshot scope (Invariant 10), and build instances by running that form with their inputs. This removes the per-instance re-parse and makes the classification scan (Invariant 14) unnecessary, because the parser itself decides whether a body declares inputs.
- **One reader for exports.** Bare `this` and `this.name` now select their names through one function, `readableThisNames` (src/parse/namespaces.ts). Still open: the three export reads (`Name.member`, `Name::member`, and `this.member`) should share one reader that takes the export map and the name and returns the value, or a problem for a function. Moving that reader to `src/scope.ts` needs the unreadable-name check moved there first, since it lives in src/parse/imports.ts.
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
- Each `newScope` allocates six maps. A scope created per loop iteration is a cost to watch.
- Each template instance re-parses its body and allocates a scope. An instance inside a loop costs one parse per iteration, and a template that instantiates itself multiplies this per level, bounded by `MAX_CALL_DEPTH` (Invariant 12).
