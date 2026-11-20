# Tuff Module Structure

Part of the canonical architecture; see [ARCHITECTURE.md](../ARCHITECTURE.md). This file is the target module layout and the dependency direction between modules.

## Layout

```
index.ts            public API: exports evaluateTuff (which composes the stages) and the public types
src/
  result.ts         Result type and helpers (ok, err, map, unwrap-for-tests)
  errors.ts         TuffError enum and message/span helpers
  span.ts           source positions shared by all stages
  lexer.ts          source -> token stream
  parser.ts         token stream -> AST
  ast.ts            AST node types (no logic): every expression and statement
  scope.ts          Scope type, creation, and name lookup; Frame (the runtime slots of one open block); NameRef and NameRefs (the resolver's output); Env (the state of one evaluation). No evaluation
  value.ts          Value (number, boolean, or Reference) and Reference (a live pointer to one frame slot). Types and guards only
  resolver.ts       AST -> Result<void, TuffError>: checks every name is bound. Computes no values
  evaluator.ts      the recursion root of evaluation: evaluateIn walks the AST, blocks create scopes, operators are applied
  branch.ts         conditionals and matches: evaluates the chosen and unchosen branches and undoes the unchosen one's writes. Receives the expression evaluator as a parameter (type Evaluate); never imports evaluator.ts
  limits.ts         configurable limits (max depth, max steps, max source length)
```

## Dependency direction

Arrows mean "may import".

```
index.ts       -> lexer.ts, parser.ts, resolver.ts, evaluator.ts, errors.ts, result.ts (evaluateTuff composes the stages; re-exports the public types)
evaluator.ts   -> ast.ts, scope.ts, value.ts, branch.ts, errors.ts, result.ts (limits.ts once it exists)
branch.ts      -> ast.ts, scope.ts, value.ts, errors.ts, result.ts (the Evaluate type only; never evaluator.ts)
value.ts       -> scope.ts (for the Frame type)
resolver.ts    -> ast.ts, scope.ts, errors.ts, result.ts
parser.ts      -> lexer.ts, ast.ts, errors.ts, result.ts, span.ts
lexer.ts       -> errors.ts, result.ts, span.ts
scope.ts       -> ast.ts (type only, for the NameRefs key); never value.ts, since value.ts imports Frame from here
errors.ts      -> span.ts
ast.ts         -> span.ts
limits.ts      -> nothing (not yet created)
result.ts      -> nothing; imported by every stage
```

## Rules

- Dependencies flow one way, from `index.ts` toward the leaves. No cycles between files.
- Each stage is a pure function from its input type to a `Result` of its output type. A stage never calls a later stage.
- Name checks run before evaluation. `DuplicateName` is a property of the block's syntax, so the parser reports it when it builds a `Block`. `UnknownName` is reported by `resolver.ts`, a static pass over the AST that uses `scope.ts`. The resolver records the binding of every name use as a block depth and a position within that block, and the evaluator reads values by that reference. The evaluator never reports a name error. It reports `InternalError` only if the resolver and evaluator disagree, which is a bug in Tuff.
- `NameRef` and `NameRefs` are defined in `scope.ts`, not in `resolver.ts`. The resolver writes them and the evaluator reads them, so the evaluator never imports the resolver. The resolver and evaluator both use `scope.ts` for block-level name slots; there is one definition of a slot, not one per stage.
- The parser must not evaluate and must not look up names. Its output is a syntactically valid AST and nothing more.
- Recursion is allowed only inside the parser, resolver, and evaluator, and only over the AST. Each stage has one recursive entry point (`parseExpr` in the parser, `resolveExpr` in the resolver, `evaluateIn` in the evaluator). A helper that must call back into its entry point receives it as a parameter, so the helper's file never imports the file that holds the entry point. Mutual recursion between functions in different files is forbidden.
- Limits: 100 lines per function, 500 code lines per file, 10 files per directory, enforced by `bun run lint` on every change.
