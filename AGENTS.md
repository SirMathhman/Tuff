# Tuff — Project Guidelines

## What is Tuff?

Tuff is a programming language that compiles to JavaScript. The compiler is a single-function stub (`compileTuffToJS` in `index.ts`) that currently returns an empty string. The test helper (`evaluate` in `index.test.ts`) prepends a type declaration, wraps compiled output with a `process.exit` shim, and runs it via `new Function("args", ...)`.

## Build and Test

```bash
bun install          # Install dependencies
bun test             # Run tests (Bun's built-in test runner, Jest-compatible API)
bun run index.ts     # Run the compiler
bun run index.test.ts # Run tests directly
```

- **Runtime**: Bun (v1.3.14+)
- **Test framework**: Bun's built-in test runner (`describe`/`it`/`expect`)
- **No build step**: `tsconfig.json` has `noEmit: true` — Bun handles transpilation at runtime
- **No linting configured**: No ESLint or Prettier config exists yet

## Architecture

The project is a stub. The intended pipeline is:

```
Source (string) → compileTuffToJS() → Generated JS (string)
```

The test helper adds a wrapper layer:

```
"in let args : &[Str]; " + source → compileTuffToJS() → wrap with process shim → new Function("args", ...)(args) → exit code (number)
```

Key architectural hints from the test file:

- **Rust-like type syntax**: `&[Str]` suggests a slice/string type system
- **Sandboxed execution**: Generated JS runs in a `new Function()` context with a mock `process.exit`
- **Exit code model**: Compiled programs return a `number` exit code

## Conventions

### Code Style

- **camelCase** for functions and variables
- **No semicolons** (Bun/TypeScript convention)
- **ESM modules** with `verbatimModuleSyntax` — use `import type` for type-only imports
- **Strict TypeScript**: `strict: true`, `noUncheckedIndexedAccess` (array access returns `T | undefined`), `noImplicitOverride`

### Error Handling

- Use `Result<T, X>` pattern (`OkResult`/`ErrResult`) instead of exceptions
- Return `{ ok: true, value }` or `{ ok: false, error }` — never `throw`
- ESLint's `no-restricted-syntax` rule bans `ThrowStatement`

### Testing

- Use `evaluate(source, args)` helper to compile and run Tuff code in tests
- Test pattern: `evaluate("source code") => expectedExitCode`
- The helper prepends `"in let args : &[Str]; "` automatically

## Pitfalls

1. **Stub state**: `compileTuffToJS` returns `""` — any test that calls it will produce empty JS and fail at runtime
2. **`noUncheckedIndexedAccess`**: Array access like `arr[i]` returns `T | undefined` — always check before use
3. **Sandbox escape**: `new Function()` is used in tests — generated JS could access globals
4. **Result monad**: Do not use `throw` in compiler internals; use the `Result` pattern
