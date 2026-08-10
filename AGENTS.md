# Project Guidelines

## Build and Test
- **Runtime**: Bun v1.3.14
- **Install**: `bun install`
- **Test**: `bun test`
- **Run**: `bun run index.ts`

## Architecture
- `index.ts` - Compiler entry point: `compileTuffToJS(tuffSource: string): string`
- `index.test.ts` - Test harness with `executeTuff()` helper that compiles Tuff source, injects `process`/`args` globals, and executes via `new Function()`

## Conventions
- Tuff programs receive `process` (with `exit(code)`) and `args` (string array) as globals
- Test helper prepends `in let args; ` to Tuff source before compilation
- Strict TypeScript with ESNext target, verbatim module syntax, no emit
