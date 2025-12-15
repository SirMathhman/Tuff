# Compiler API Refactoring: Implementation Guide

## What Changed

We've created the scaffolding for **Option 4: Pure In-Memory Compiler API**. Here's what exists now:

1. **[compiler_api.tuff](../src/main/tuff/compiler/compiler_api.tuff)** — Planning document; signatures TBD
2. **[compiler-api-refactor.md](../docs/compiler-api-refactor.md)** — Full design doc and risk analysis
3. **[compiler_api_wrapper.ts](../src/test/ts/compiler_api_wrapper.ts)** — TypeScript wrapper (stubs for now)

## Implementation Roadmap

### Phase 1: Extract Core Logic (Days 1-2)

**Goal**: Break up `compile_project()` into reusable, testable pieces.

#### Step 1.1: Create a module-graph walker function

**File**: `src/main/tuff/compiler/tuffc_lib.tuff`

Currently, `compile_project()` does:

1. DFS walk of module graph (lines 804-900ish)
2. Per-module parsing/analysis/emission (inside loop)

**Create a new function:**

```tuff
// Pure function that doesn't read/write files
fn walk_module_graph(
  entryPath: String,
  moduleLookup: (String) => String,  // callback to read sources
  on_module_visited: (path: String, src: String) => Void
) : Void => {
  // DFS walk: don't call readTextFile, call moduleLookup instead
  // Call on_module_visited for each module found
}
```

**Why**: Separates module discovery from file I/O. Can be reused for both file-based and in-memory compilation.

#### Step 1.2: Extract single-module compilation

**File**: `src/main/tuff/compiler/tuffc_lib.tuff`

Currently, module compilation happens inside the DFS loop. Extract it:

```tuff
fn compile_one_module(
  modulePath: String,
  sourceCode: String,
  outDir: String,
  exportTable: Vec<String>
) : String => {  // returns JS code
  // parse sourceCode
  // analyze (using cached export tables from other modules)
  // emit to JS
  // return JS code (don't write to disk)
}
```

**Why**: Lets us reuse the same logic for both file-based and in-memory compilation.

---

### Phase 2: Implement Pure API (Days 3-5)

**File**: `src/main/tuff/compiler/compiler_api.tuff`

Once you have the extracted helpers, implement:

```tuff
out fn compile_code(
  entryCode: String,
  moduleLookup: (String) => String
) : CompileResult => {
  // 1. reset global state
  // 2. use walk_module_graph with moduleLookup callback
  // 3. for each module, call compile_one_module
  // 4. collect all JS outputs into a single string
  // 5. return success or errors
}

out fn lint_code(
  entryCode: String,
  moduleLookup: (String) => String
) : LintResult => {
  // Like compile_code, but no emit phase
  // Just parse + analyze, return diagnostics
}
```

---

### Phase 3: Update CLI Wrappers (Days 6-7)

**Files**: `src/main/tuff/compiler/tuffc.tuff`, `fluff.tuff`

```tuff
fn main(argv: Vec<String>) => {
  // ... parse args ...

  let entryCode = readTextFile(inPath);  // File I/O at CLI level

  // Call pure API with filesystem callback
  let result = compile_code(entryCode, (path) => {
    readTextFile(resolve_module_path(inPath, path))
  });

  if (result.success) {
    writeTextFile(outPath, result.code);
  } else {
    println(result.diagnostics);
    yield 1;
  }

  0
}
```

**Why**: CLI becomes a thin wrapper. Pure compilation logic is decoupled from I/O.

---

### Phase 4: TypeScript Integration (Days 8-9)

**File**: `src/test/ts/compiler_api_wrapper.ts`

Once compiler_api.tuff is compiled to `.mjs`, update the wrapper:

```typescript
export async function compileCode(
  entryCode: string,
  modules: ModuleStore
): Promise<CompileResult> {
  const compilerApi = await import("./selfhost/prebuilt/compiler_api.mjs");
  const result = compilerApi.compile_code(
    entryCode,
    (path) => modules[path] || ""
  );
  return {
    success: result.isOk(),
    code: result.code,
    diagnostics: result.diagnostics,
  };
}
```

---

### Phase 5: Test Migration (Days 10-14)

**Files**: `src/test/ts/selfhost_helpers.ts` and all `test.ts` files

**Old pattern:**

```typescript
const outDir = resolve(".dist", "case-1234");
await mkdir(outDir, { recursive: true });
const { entryFile } = await stagePrebuiltSelfhostCompiler(outDir);
const tuffc = await import(tuffcFile);
const rc = tuffc.main([inFile, outFile]);
```

**New pattern:**

```typescript
const modules: ModuleStore = {
  entry: "fn main() => 0",
  "std/prelude": "...",
};
const result = await compileCode(modules["entry"], modules);
if (!result.success) {
  throw new Error(result.diagnostics);
}
// result.code is the JS output
```

**Benefits**:

- No disk I/O
- Tests run in parallel without contention
- 10-50x faster
- Cleaner test output

---

## Validation Checklist

- [ ] `npm run test` passes
- [ ] `npm run test:verbose` passes
- [ ] No `.dist/` directory created during tests
- [ ] Tests complete in <20 seconds (vs. current ~40s)
- [ ] No regressions in error messages or diagnostics

---

## Questions?

Refer to [compiler-api-refactor.md](../docs/compiler-api-refactor.md) for:

- Design rationale
- Risk analysis
- Edge cases and corner cases
- Performance expectations
