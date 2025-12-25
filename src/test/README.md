# Tuff Tests

This directory contains the test suite for the Tuff compiler and language. Tests are organized into **TypeScript tests** (for compiler validation) and **Tuff tests** (for language feature validation).

## Directory Structure

```
src/test/
├── ts/                 # TypeScript tests (Vitest)
│   ├── selfhost*.test.ts      # Compiler bootstrap validation
│   ├── tuff_tests_runner.test.ts  # Language feature tests
│   ├── helpers.ts             # Test utilities
│   └── ...
├── tuff/              # Tuff language tests
│   ├── *.test.tuff    # Tuff test files (compiled + run by tuff_tests_runner)
│   └── ...
```

## TypeScript Tests (`ts/`)

Vitest-based tests that validate the compiler stages, CLI, and integration.

### Core Bootstrap Tests

| Test                          | Purpose                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **`selfhost.test.ts`**        | **Stage 1**: Validates that the prebuilt compiler can compile a minimal program (parse → analyze → emit).                                     |
| **`selfhost_stage2.test.ts`** | **Stage 2**: Validates that the selfhost compiler can compile itself (prebuilt compiles source → Stage 2 binary).                             |
| **`selfhost_stage3.test.ts`** | **Stage 3/4 Fixed-Point**: Verifies that `Stage3 == Stage4` — the compiler reaches a fixed point (further compilation doesn't change output). |

### Compiler Feature Tests

| Test                                        | Purpose                                                             |
| ------------------------------------------- | ------------------------------------------------------------------- |
| **`selfhost_diagnostics.test.ts`**          | Error message formatting and diagnostic accuracy.                   |
| **`selfhost_types.test.ts`**                | Type annotation, generic support, and type inference.               |
| **`selfhost_module_split.test.ts`**         | Validates that analyzer modules split architecture works correctly. |
| **`selfhost_multifile_support.test.ts`**    | Multi-file compilation and module importing.                        |
| **`selfhost_deprecation_warnings.test.ts`** | Deprecation message generation.                                     |
| **`selfhost_lint_complexity.test.ts`**      | Linting: function complexity checks.                                |
| **`selfhost_lint_file_size.test.ts`**       | Linting: file size warnings.                                        |

### Language Feature Tests

| Test                                        | Purpose                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`tuff_tests_runner.test.ts`**             | **Main language validator**: Compiles all `.tuff` test files (in `src/test/tuff/`) and runs their `run()` functions. Uses Tuff's built-in test framework (`std::test`). |
| **`generated_expr_parser_compile.test.ts`** | Tests generated expression parser from EBNF grammar.                                                                                                                     |
| **`tuff_test_framework_migration.test.ts`** | Validates Tuff test framework utilities.                                                                                                                                 |

### CLI and Integration Tests

| Test                                       | Purpose                                    |
| ------------------------------------------ | ------------------------------------------ |
| **`selfhost_cli_followups.test.ts`**       | CLI argument handling and error cases.     |
| **`repl_compile_run.test.ts`**             | REPL compilation and execution.            |
| **`refactor_cli_move_file.test.ts`**       | Refactoring CLI operations.                |
| **`lsp_find_definition_no_crash.test.ts`** | Language Server Protocol basic operations. |

### Prebuilt Validation

| Test                                                     | Purpose                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **`selfhost_prebuilt_no_duplicate_object_keys.test.ts`** | Validates that prebuilt modules don't have duplicate object keys (ES module validity). |

### Helper Modules

| Module                            | Purpose                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **`helpers.ts`**                  | Shared test utilities (temp directory setup, file I/O).                                                                                  |
| **`selfhost_helpers.ts`**         | **Critical**: Stages prebuilt compiler + test files into `.dist/` for test execution. Copies `selfhost/prebuilt/` → `.dist/tuff-tests/`. |
| **`api/compiler_api_wrapper.ts`** | Wrapper around compiler API for test convenience.                                                                                        |

## Tuff Tests (`tuff/`)

Pure Tuff test files that validate language features. Each file:

1. **Imports `std::test`** — testing framework
2. **Defines `out fn run() : I32`** — entry point that runs tests and returns status (0 = pass, 1 = fail)
3. **Uses test helpers** — `reset()`, `suite()`, `it()`, `expect_eq()`, `summary()`, `status()`

### Example Test File

```tuff
// src/test/tuff/my_feature.test.tuff
from std::test use { reset, suite, it, expect_eq, summary, status };

out fn run() : I32 => {
  reset();
  suite("my feature");

  it("test 1", expect_eq("description", 1 + 1, 2));
  it("test 2", expect_eq("description", 5 - 3, 2));

  summary();
  status()
}
```

### Existing Test Files

- **`ast_smoke.test.tuff`** — Basic AST node creation and accessors
- **`ast_emit_js.test.tuff`** — AST → JavaScript emission (literals, operators, calls, if expressions)
- **`selfhost_char.test.tuff`** — Character literal support
- **`selfhost_structs_unions.test.tuff`** — Struct/union construction and field access
- **`selfhost_tuples.test.tuff`** — Tuple literals and indexing (`.0`, `.1`)

## Running Tests

### Run All Tests

```bash
npm test                # quiet mode (summary only)
npm run test:verbose    # verbose output (all test names)
```

### Run Specific Test

```bash
npm test -- selfhost.test.ts                    # single file
npm test -- selfhost_types.test.ts --reporter=verbose
```

### Run Bootstrap Validation

```bash
npm run check:bootstrap           # Run tests + validate prebuilt artifact
npm run check:prebuilt            # Rebuild prebuilt and check for diffs
npm run build:selfhost-prebuilt   # Rebuild prebuilt only
```

### Run Language Feature Tests Only

```bash
npm test -- tuff_tests_runner.test.ts
```

## Test Staging & Prebuilt Management

Tests rely on a **staged environment** (`.dist/tuff-tests/`) where:

1. **`selfhost_helpers.ts`** copies prebuilt `.mjs` modules from `selfhost/prebuilt/`
2. `.tuff` test files are compiled using the prebuilt compiler
3. Compiled output (stage1/stage2/stage3/stage4 binary) is generated on-the-fly
4. Output is executed to verify language behavior

**Important**: After modifying compiler source, regenerate prebuilt:

```bash
npm run build:selfhost-prebuilt
```

All compiler modules must be included in `selfhost/prebuilt/`, not just `tuffc.mjs` and `tuffc_lib.mjs`, because runtime ESM imports depend on their presence.

## Adding a Test

### For a Language Feature (Tuff)

1. Create `src/test/tuff/my_feature.test.tuff`
2. Import `std::test` framework
3. Define `out fn run() : I32` with test cases
4. Run: `npm test -- tuff_tests_runner.test.ts`

### For Compiler Behavior (TypeScript)

1. Create `src/test/ts/my_feature.test.ts`
2. Use Vitest + helpers from `helpers.ts`
3. Test via `compiler_api_wrapper.ts` or direct `tuffc.mjs` invocation
4. Run: `npm test -- my_feature.test.ts`

## Test Philosophy

- **Minimal dependencies** — Tests should be self-contained; avoid external files when possible
- **Deterministic** — No randomness or timing-dependent assertions
- **Fast** — Each test should complete in < 100ms (prebuilt compiler is fast)
- **Clear naming** — Test names describe the feature being validated
- **Comprehensive** — Cover happy path, edge cases, error cases

## Debugging Failed Tests

1. **Check error message** — Diagnostics include file/line/column
2. **Inspect `.dist/` output** — Compiled files remain for inspection
3. **Run with `--reporter=verbose`** — See full test output
4. **Check prebuilt sync** — Run `npm run check:prebuilt` to validate prebuilt artifacts
5. **Rebuild prebuilt** — `npm run build:selfhost-prebuilt` in case of drift

## Coverage

Tests achieve **high coverage** of:

- ✓ Lexer (tokenization)
- ✓ Parser (syntax validation)
- ✓ Analyzer (type checking, scope, generics)
- ✓ Emitter (JS generation)
- ✓ CLI (command-line interface)
- ✓ Multi-file compilation
- ✓ Deprecations and warnings

See `TASKS.md` for expansion plans (incremental compilation, LSP, IDE integration).
