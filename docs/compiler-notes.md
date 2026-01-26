# Compiler notes

## Variable hoisting / extraction

The compiler performs a pass that scans the generated JavaScript and hoists simple assignments into a single top-level `var ...;` declaration inside the emitted IIFE.

This pass also supports JS destructuring assignments like:

```js
({ x, y } = someValue);
```

To avoid invalid JavaScript, the destructuring detector only triggers when a real destructuring assignment is present (i.e. a closing `}` followed by `=`), and it ignores JS reserved words.

## Multi-module bundling (`compileAll`)

Tests that execute multiple modules (see `interpretAll`) use a small helper compiler entrypoint that merges multiple module sources into a single compilation unit.

- Strips `use ... from ...;` and `extern ...` declarations (the compiler itself doesn’t parse these statements yet).
- Treats `out` declarations in module sources as normal top-level declarations.
- Supports module references like `let alias from lib; alias.get()` by rewriting the alias access to the member directly.
- Prepends simple native JS shims (strips ESM `export` keywords) before evaluating the compiled IIFE.

## Dev checks

The repo runs PMD CPD (copy/paste detection) as part of the pre-commit checks.

- The current configuration uses `--minimum-tokens 35` and ignores identifiers/literals.
- To keep CPD signal high at this threshold, common “plumbing” patterns are factored into shared helpers/types (for example: base handler params, scope-context builders, and loop context normalization).

## Move semantics (droppable types)

The compiler performs a lightweight validation pass to reject use-after-move for variables whose type alias is declared with a `then drop` clause (e.g. `type Temp = I32 then drop;`).

This relies on the declaration parser correctly treating braced blocks (like `fn ... => { ... }`) as statement boundaries, even when they aren’t followed by a semicolon.

## Runtime destructor execution

The compiler now also executes type destructors declared via `type Alias = Base then dropFn;` when leaving a plain braced scope block (`{ ... }`).

- Calls the alias’s drop function for variables declared inside the scope.
- If the variable is an array of a droppable element type, calls the drop function on each element.
- If the variable is a struct whose fields are droppable aliases, calls the appropriate drop function for each droppable field.

## Functions

Top-level functions with an empty braced body (e.g. `fn drop(this : I32) => {}`) are compiled to an expression that returns `0`.

## Pointers

Pointer targets are wrapped to simulate references in JavaScript. This also applies when the target variable has a type annotation (e.g. `let x : I32 = 100; let p : *I32 = &x; *p`).
