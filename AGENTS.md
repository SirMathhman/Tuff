# Project Guidelines

## Build and Test
- **Runtime**: Bun v1.3.14
- **Install**: `bun install`
- **Test**: `bun test`
- **Lint**: `bun run lint` (runs `tsc --noEmit && eslint . --fix`)
- **CPD**: `bun run cpd` (PMD copy-paste detector on `index.ts` and `index.test.ts`)
- **Run**: `bun run index.ts`

## Architecture
`index.ts` is the entry point that chains four compiler stages from `src/`:

1. **`src/tokenizer.ts`** — `tokenize()` produces `Token[]` with types: `number`, `boolean`, `op`, `keyword`, `punct`, `eof`
2. **`src/parser.ts`** — `Parser` class produces `AstNode[]`; node types: `decl`, `let`, `assign`, `expr`, `while`, `for`, `break`, `continue`. Expressions (`Expr`) include `number`, `boolean`, `identifier`, `binary`, `range`, `group`, `assign`, `if`
3. **`src/validator.ts`** — `validateScopes()` tracks declared vars, mutability, and types (`VarType` = `number` | `boolean` | `range` | `array`); throws on undefined vars, assignment to immutable vars, and type mismatches
4. **`src/generator.ts`** — `generateJS()` emits JS; top-level expressions become `process.exit(Number(...))`

Type definitions are in `src/types.ts`. No circular dependencies: types → tokenizer → parser → validator/generator.

Entry point: `compileTuffToJS(tuffSource: string): string` in `index.ts`.

## Conventions
- Tuff programs receive `process` (with `exit(code)`) and `args` (string array) as globals
- Test helper `executeTuff()` in `index.test.ts` prepends `in let args; ` to Tuff source, injects `process`/`args` via `new Function()`, and returns the exit code
- `in let <var>;` declares environment-injected variables; the compiler strips these (they become function parameters at runtime)
- `let` is immutable by default; `let mut` allows reassignment
- Strict TypeScript with ESNext target, verbatim module syntax, no emit
- ESLint warns on files over 500 lines (`max-lines` rule) — keep `index.ts` under this limit
