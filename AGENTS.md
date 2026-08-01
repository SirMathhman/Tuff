# Tuff — Project Guidelines

## What is Tuff?

Tuff is a programming language that compiles to JavaScript. The compiler pipeline is fully implemented in `index.ts` (`compileTuffToJS`) and `src/`. The test helper (`evaluate` in `index.test.ts`) prepends a type declaration, wraps compiled output with a `process.exit` shim, and runs it via `new Function("args", ...)`.

## Documentation

- [`docs/missing-features.md`](docs/missing-features.md) — roadmap/wishlist of language features Tuff should support but doesn't yet (e.g. `for` loops, `break`/`continue`, `match`). Consult before adding a feature to avoid duplicating planned work.
- [`docs/plan-*.md`](docs/) — design plans for refactors (symbol table, function table, codegen unification, reference representation, etc.). Many describe the _current_ architecture and the _target_ design; read the relevant plan before touching the checker/codegen to understand intended direction.

## Build and Test

```bash
bun install          # Install dependencies
bun test             # Run tests (Bun's built-in test runner, Jest-compatible API)
bun run lint         # tsc --noEmit && eslint . --fix
bun run format       # prettier . --write
bun run cpd          # PMD copy-paste detection (min 50 tokens)
bun run cycle        # madge circular-dependency check on src/
bun run index.ts     # Run the compiler
bun run index.test.ts # Run tests directly
```

- **Runtime**: Bun (v1.3.14+)
- **Test framework**: Bun's built-in test runner (`describe`/`it`/`expect`)
- **No build step**: `tsconfig.json` has `noEmit: true` — Bun handles transpilation at runtime
- **Lint/format configured**: `eslint.config.ts` and Prettier exist. A `.github/hooks/hooks.json` `Stop` hook runs `test`, `lint`, `format`, `cpd`, and `cycle` — all must pass before a session ends.

## Architecture

The pipeline is:

```
Source (string) → tokenize → Parser → validateScope → generateJS → Generated JS (string)
```

The test helper adds a wrapper layer:

```
"in let args : &[Str]; " + source → compileTuffToJS() → wrap with process shim → new Function("args", ...)(args) → exit code (number)
```

Key architectural facts:

- **Rust-like type syntax**: `&[Str]` suggests a slice/string type system
- **Sandboxed execution**: Generated JS runs in a `new Function()` context with a mock `process.exit`
- **Exit code model**: Compiled programs return a `number` exit code. The final expression is coerced with `Number(...)`; a `let` declaration is a declaration (never emits `process.exit`), so a program ending in `let` exits `0`. Only an expression statement produces an exit code.
- **`args` is implicitly declared** (immutable) in the root scope by `index.ts`.

### Source layout (`src/`)

- `tokenizer.ts` — string → `Token[]`; fails loudly on unknown characters
- `parser.ts` — `Token[]` → `ASTNode` (via `createParser`)
- `ast.ts` — token + AST node types, `isExpression()`, and the centralized `OPERATORS` table
- `checker.ts` — `validateScope(stmts, scope)` semantic checking (threads a `CheckContext`)
- `scope.ts` — `createScope(parent?)` lexical scope factory (no classes)
- `types.ts` — **single source of truth** for the type system (type table, suffixes, ranges, inference, assignability)
- `codegen.ts` — `generateJS(node)` → JS string
- `result.ts` — `Result<T, X>` monad (`ok`/`err`, `map`, `andThen`)
- `compileError.ts` — `CompileError { kind: "scope" | "syntax", message }`

## Conventions

### Code Style

- **camelCase** for functions and variables
- **No semicolons** (Bun/TypeScript convention)
- **ESM modules** with `verbatimModuleSyntax` — use `import type` for type-only imports
- **Strict TypeScript**: `strict: true`, `noUncheckedIndexedAccess` (array access returns `T | undefined`), `noImplicitOverride`
- **No classes** — use factory functions with closures (e.g. `createScope`, `createParser`)

### Error Handling

- Use `Result<T, X>` pattern (`OkResult`/`ErrResult`) instead of exceptions
- Return `{ ok: true, value }` or `{ ok: false, error }` — never `throw`
- Use `compileError(kind, message)` to build errors; kinds are `"scope"` (semantic) and `"syntax"` (syntax/lexical)

### ESLint restrictions (enforced — do not violate)

`eslint.config.ts` bans via `no-restricted-syntax`:

- `ClassDeclaration` — no classes
- `ThrowStatement` — no `throw`
- `TemplateLiteral` — no backticks; use string concatenation
- `TSTypeLiteral` — use named interfaces, not inline object types
- `Literal[regex]` — no regexes

And via `@typescript-eslint/no-restricted-types`:

- `Record` — use `Map` instead
- `Error` — use the custom `CompileError`, not the default JS `Error`

### Type system (`src/types.ts`)

- Known types: `U8`, `U16`, `U64`, `I32`, `Int` (generic default), `Bool`, `Void`
- Literal suffixes: `U64`, `U16`, `U8` (longest-first in `SUFFIXES`). There is **no** `I32` suffix — `100I32` is invalid; use `100 is I32` or `let x : I32 = 100`
- Adding a new type = edit `src/types.ts` only
- `is` is a compile-time type check (`value is TypeName`); codegen emits the precomputed boolean, not a runtime check

### Testing

- Use `evaluate(source, args)` helper to compile and run Tuff code in tests
- Test pattern: `evaluate("source code") => expectedExitCode`
- The helper prepends `"in let args : &[Str]; "` automatically
- Use `expectCompileError(source, errorKind)` to assert a compile failure and its kind

## Pitfalls

1. **`noUncheckedIndexedAccess`**: Array access like `arr[i]` returns `T | undefined` — always check before use
2. **Sandbox escape**: `new Function()` is used in tests — generated JS could access globals
3. **Result monad**: Do not use `throw` in compiler internals; use the `Result` pattern
4. **Codegen precedence bug**: codegen does NOT emit grouping parentheses around `binary_op` nodes, so `(1 + 2) * 3` compiles to `1 + 2 * 3` (JS evaluates as `1 + (2*3) = 7`). Known pre-existing bug — don't "fix" tests around it without addressing codegen.
5. **ASI gotcha**: Never format generated JS with a newline after `return` — ASI turns `return \n ...` into `return;`
6. **Parser queue**: if the parser emits queued statements (syntax-lowering), EOF loops must drain the queue (`while !eof || queue.length > 0`) or trailing lowered declarations are dropped
