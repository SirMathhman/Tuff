# Compiler API Refactoring: Separation of I/O and Logic

## Overview

**Goal**: Transform the compiler from file-path-based to code-based, enabling:

- In-memory testing (no disk I/O)
- REPL support
- Online playgrounds
- Language server protocol (LSP)
- Parallel compilation

## Current Architecture

```
tuffc.tuff (CLI)
  ├─ reads inPath from filesystem
  ├─ calls compile_project(inPath, outPath)
  │   ├─ DFS walk of module graph
  │   ├─ readTextFile() for each module
  │   ├─ parse + analyze + emit each module
  │   ├─ writeTextFile() for each output
  │   └─ writes outPath to filesystem
  └─ returns exit code

fluff.tuff (Linter CLI)
  ├─ reads entryPath from filesystem
  ├─ calls fluff_project(entryPath)
  │   ├─ DFS walk of module graph
  │   ├─ readTextFile() for each module
  │   ├─ parse + analyze (no emit)
  │   └─ emits diagnostics to stdout
  └─ returns exit code
```

**Problem**: Tests must use disk I/O (`.dist/` staging) because:

1. Module resolution requires reading files
2. Compiler only accepts file paths, not code strings
3. ESM module caching requires unique file paths per compilation stage

## New Architecture

```
compiler_api.tuff (Pure Logic)
  ├─ compileCode(entryCode, moduleLookup) -> CompileResult
  │   ├─ Accepts entry source as string
  │   ├─ Uses moduleLookup callback to resolve imports
  │   ├─ parse + analyze + emit all modules
  │   └─ Returns JS code or diagnostics
  │
  ├─ lintCode(entryCode, moduleLookup) -> LintResult
  │   ├─ Accepts entry source as string
  │   ├─ Uses moduleLookup callback to resolve imports
  │   ├─ parse + analyze (no emit)
  │   └─ Returns diagnostics

tuffc.tuff (CLI - File I/O Layer)
  ├─ reads inPath from filesystem
  ├─ calls compileCode(code, (path) => readTextFile(path))
  ├─ writes output to disk
  └─ returns exit code

fluff.tuff (Linter CLI - File I/O Layer)
  ├─ reads entryPath from filesystem
  ├─ calls lintCode(code, (path) => readTextFile(path))
  ├─ writes diagnostics to disk/stdout
  └─ returns exit code

Tests (In-Memory)
  ├─ call compileCode(code, (path) => memoryStore[path])
  ├─ no disk I/O
  ├─ faster execution
  └─ easier parallelization
```

## Refactoring Plan

### Phase 1: Extract Core Logic (Current)

✅ [1.1] Create `compiler_api.tuff` with API signatures

- [ ] [1.2] Extract `compile_project`'s module-graph DFS into pure function
- [ ] [1.3] Extract single-module compilation (parse+analyze+emit) into helpers

### Phase 2: Implement Pure API

- [ ] [2.1] Implement `compileCode(entryCode, moduleLookup)`
- [ ] [2.2] Implement `lintCode(entryCode, moduleLookup)`
- [ ] [2.3] Update tuffc.tuff to use `compileCode()`
- [ ] [2.4] Update fluff.tuff to use `lintCode()`

### Phase 3: TypeScript Integration

- [ ] [3.1] Create `compiler_api_ts_wrapper.ts` for easier test binding
- [ ] [3.2] Export in prebuilt `.mjs` so tests can import

### Phase 4: Test Migration

- [ ] [4.1] Update `selfhost_helpers.ts` to use in-memory API
- [ ] [4.2] Create `in_memory_module_store.ts` helper
- [ ] [4.3] Refactor test files to use new API
- [ ] [4.4] Remove `.dist/` staging directory usage

### Phase 5: Validation

- [ ] [5.1] Verify `npm run test` passes
- [ ] [5.2] Verify `npm run test:verbose` passes
- [ ] [5.3] Performance benchmarks (local vs. disk)

## Key Design Decisions

### ModuleLookup Callback

```typescript
type ModuleLookup = (modulePath: string) => string;
```

- **Why callback?** Each test or tool can inject its own resolution logic.
- **What does it receive?** Normalized module path (e.g., `"std/prelude"`, `"lib/utils"`).
- **What should it return?** Full source code of that module, or empty string if not found.

### Diagnostics Format

- Errors/warnings are collected in global state (current behavior).
- New functions return `{ success, code?, diagnostics? }`.
- CLI layer formats and outputs diagnostics.

### No Breaking Changes

- Existing `compile_project()` and `fluff_project()` remain as-is for backward compatibility.
- CLI behavior is unchanged (still accepts file paths).
- Tests gradually migrate to new API.

## Expected Outcomes

### Performance

- **Local tests:** ~10-50x faster (no disk I/O, in-memory modules)
- **CI:** Cleaner temp directories (no `.dist/` pollution)
- **Parallelization:** Easier to run tests in parallel (no contention)

### Usability

- **Online playgrounds:** Can compile code strings directly
- **REPL:** Pure function enables interactive compilation
- **Language servers:** Can analyze single files without full module resolution

### Code Quality

- **Testability:** Pure functions are easier to test
- **Modularity:** Clear separation of concerns (I/O vs. logic)
- **Maintainability:** Easier to add features (caching, parallelization, etc.)

## Open Questions

1. **Module resolution strategy**: Should `moduleLookup` handle relative paths (e.g., `"../foo"`), or is normalization the caller's responsibility?

   - **Proposal:** Caller normalizes; callback receives canonical module paths.

2. **Error/warning formatting**: Should `compileCode()` return raw diagnostics or formatted strings?

   - **Proposal:** Return `{ success, diagnostics: DiagInfo[] }` and let caller format.

3. **Caching**: Should the compiler cache parsed ASTs or compiled modules across calls?
   - **Proposal:** No built-in caching; tests/tools can add their own wrapper.

## Implementation Notes

### Step 1.2: Extract Module Graph DFS

- Current `compile_project()` walks the module graph and calls `readTextFile()`.
- New function: `fn compile_project_with_lookup(entryPath: String, outPath: String, moduleLookup: ModuleLookup)`
- Gradually replace `readTextFile(path)` with `moduleLookup(normalize_path(path))`.

### Step 1.3: Extract Single-Module Compilation

- Current: Module compilation happens inside the DFS loop.
- New: `fn compile_module_to_js(src: String, modulePath: String, exports: Vec<String>, ...) -> String`
- Reuse for both `compile_project()` and `compileCode()`.

### Step 2.1: Implement `compileCode()`

- Similar to `compile_project()` but:
  - Takes entry source as string, not path.
  - Uses `moduleLookup` callback, not `readTextFile()`.
  - Returns JS code or diagnostics, doesn't write to disk.

## Testing Strategy

### Immediate (Phase 4)

```typescript
// Old (with disk I/O)
const result = await buildStage2Compiler(outDir);
const rc = tuffc.main([inFile, outFile]);

// New (in-memory)
const modules = {
  entry: "fn main() => 0",
  "std/prelude": "...",
};
const result = compileCode(modules["entry"], (path) => modules[path]);
```

### Eventually (Phase 5)

- All tests use in-memory modules.
- No disk staging needed.
- Tests run 10-50x faster.

## Risk Mitigation

| Risk                          | Mitigation                                                     |
| ----------------------------- | -------------------------------------------------------------- |
| Breaking existing CLI         | Keep `compile_project()` and `fluff_project()` unchanged       |
| Test failures during refactor | Implement and test pure API in isolation first                 |
| Performance regression        | Benchmark before/after; profile hot paths                      |
| Module resolution bugs        | Extensive tests for edge cases (relative paths, circular deps) |
