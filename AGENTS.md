# Project Guidelines

## Build and Test
- **Runtime**: Bun v1.3.14
- **Install**: `bun install`
- **Test**: `bun test`
- **Lint**: `bun run lint` (runs `tsc --noEmit && eslint . --fix`)
- **CPD**: `bun run cpd` (PMD copy-paste detector on `index.ts` and `index.test.ts`)
- **Run**: `bun run index.ts`

## Architecture
`index.ts` is a single-file compiler that transforms "Tuff" source into JavaScript. The pipeline is:

1. **Tokenizer** (`tokenize`) — produces `Token[]` with types: `number`, `boolean`, `op`, `keyword`, `punct`, `eof`
2. **Parser** (`Parser` class) — produces `AstNode[]`; node types: `decl`, `let`, `assign`, `expr`, `while`, `for`, `break`, `continue`. Expressions (`Expr`) include `number`, `boolean`, `identifier`, `binary`, `range`, `group`, `assign`, `if`
3. **Scope validation** (`validateScopes`) — tracks declared vars, mutability, and types (`VarType` = `number` | `boolean` | `range` | `array`); throws on undefined vars, assignment to immutable vars, and type mismatches
4. **Code generation** (`generateJS`) — emits JS; top-level expressions become `process.exit(Number(...))`

Entry point: `compileTuffToJS(tuffSource: string): string`.

## Conventions
- Tuff programs receive `process` (with `exit(code)`) and `args` (string array) as globals
- Test helper `executeTuff()` in `index.test.ts` prepends `in let args; ` to Tuff source, injects `process`/`args` via `new Function()`, and returns the exit code
- `in let <var>;` declares environment-injected variables; the compiler strips these (they become function parameters at runtime)
- `let` is immutable by default; `let mut` allows reassignment
- Strict TypeScript with ESNext target, verbatim module syntax, no emit
- ESLint warns on files over 500 lines (`max-lines` rule) — keep `index.ts` under this limit
