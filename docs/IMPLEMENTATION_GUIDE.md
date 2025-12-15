# Compiler API Refactoring: Implementation Guide

## What Changed

We've created the scaffolding for **Option 4: Pure In-Memory Compiler API**. Here's what exists now:

1. **In-memory API (Tuff)** — implemented in **`src/main/tuff/compiler/tuffc_lib.tuff`**:
  - `out fn compile_code(entryCode, moduleLookup) => (outRelPaths, jsOutputs)`
  - `out fn lint_code(entryCode, moduleLookup) => (errors, warnings)`
2. **Callback-based project entrypoints (Tuff)** — also in **`tuffc_lib.tuff`**:
  - `out fn compile_project_to_outputs(entryPath, outPath, readSource)`
  - `out fn fluff_project_with_reader(entryPath, readSource)`
3. **[compiler-api-refactor.md](../docs/compiler-api-refactor.md)** — Full design doc and risk analysis
4. **[compiler_api_wrapper.ts](../src/test/ts/compiler_api_wrapper.ts)** — TypeScript wrapper (implemented)

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

**File**: `src/main/tuff/compiler/tuffc_lib.tuff`

Once you have the extracted helpers, implement:

```tuff
out fn compile_code(entryCode: String, moduleLookup: (String) => String)
  => (outRelPaths, jsOutputs)

out fn lint_code(entryCode: String, moduleLookup: (String) => String)
  => (errors, warnings)
```

---

### Phase 3: Update CLI Wrappers (Days 6-7)

**Files**: `src/main/tuff/compiler/tuffc.tuff`, `fluff.tuff`

```tuff
fn main(argv: Vec<String>) => {
  // ... parse args ...

  // File I/O at CLI level, compilation logic returns outputs.
  let r = compile_project_to_outputs(inPath, outPath, readTextFile);
  let outFiles = r.0;
  let jsOutputs = r.1;
  // writeTextFile(outFiles[i], jsOutputs[i])

  0
}
```

**Why**: CLI becomes a thin wrapper. Pure compilation logic is decoupled from I/O.

---

### Phase 4: TypeScript Integration (Days 8-9)

**File**: `src/test/ts/compiler_api_wrapper.ts`

The wrapper now imports the prebuilt selfhost modules directly:

```typescript
export async function compileCode(
  entryCode: string,
  modules: ModuleStore
): Promise<CompileResult> {
  const tuffcLib = await import("selfhost/prebuilt/tuffc_lib.mjs");
  const [outRelPaths, jsOutputs] = tuffcLib.compile_code(entryCode, (p) => modules[p] || "");
  return { success: true, outRelPaths, jsOutputs };
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

**Benefits** (incremental):

- In-memory API tests no longer need stage2 builds or `.dist/` staging
- Fewer moving parts per test (no runtime copying)
- Cleaner, more direct tests of the pure APIs

---

## Validation Checklist

- [ ] `npm run test` passes
- [ ] `npm run test:verbose` passes
- [ ] In-memory API tests do not require `.dist/` staging
- [ ] `npm run build:selfhost-prebuilt` produces up-to-date `selfhost/prebuilt/`
- [ ] `editors/vscode/scripts/sync-prebuilt.mjs` keeps extension prebuilt in sync

---

## Questions?

Refer to [compiler-api-refactor.md](../docs/compiler-api-refactor.md) for:

- Design rationale
- Risk analysis
- Edge cases and corner cases
- Performance expectations
