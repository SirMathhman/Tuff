# Compiler notes

## Variable hoisting / extraction

The compiler performs a pass that scans the generated JavaScript and hoists simple assignments into a single top-level `var ...;` declaration inside the emitted IIFE.

This pass also supports JS destructuring assignments like:

```js
({ x, y } = someValue);
```

To avoid invalid JavaScript, the destructuring detector only triggers when a real destructuring assignment is present (i.e. a closing `}` followed by `=`), and it ignores JS reserved words.

## Dev checks

The repo runs PMD CPD (copy/paste detection) as part of the pre-commit checks.

- The current configuration uses `--minimum-tokens 35` and ignores identifiers/literals.
- To keep CPD signal high at this threshold, common “plumbing” patterns are factored into shared helpers/types (for example: base handler params, scope-context builders, and loop context normalization).
