# Testing Infrastructure Improvement Plan

**Current State:** 94 tests, ~26s runtime, significant noise in output from compiler diagnostics

---

## Problem Analysis

### 1. Output Noise

- **Issue**: Compiler warnings/diagnostics print directly to stdout during test execution
- **Impact**: 100+ lines of warnings obscure test results; hard to see failures
- **Root cause**: Only ~12 tests use `captureStdout()` helper; most tests call `tuffc.main()` or `fluff.main()` without capturing output

### 2. Test Performance

- **Issue**: Total runtime ~26s (279s cumulative across parallel tests)
- **Hotspots**:
  - Each test rebuilds stage2 compiler from scratch (~3-5s per test file)
  - No caching of compiled compiler artifacts between tests
  - Lint tests are particularly slow (4-5s each)

### 3. Code Duplication

- **Issue**: `captureStdout()` helper duplicated in 10+ test files
- **Impact**: Maintenance burden; inconsistent behavior across tests
- **Examples**: Different signature in `selfhost_lint_only.test.ts` vs others

**Recent example**:

- `src/test/ts/generated_expr_parser_compile.test.ts` adds another local stdout-capture helper to validate EBNF-driven parser generation (now including blocks, match expressions, and string literals); migrate it to the shared utility when Phase 1 lands.

### 4. Test Organization

- **Issue**: 38 test files, some with overlapping concerns
- **Examples**:
  - Multiple `selfhost_analyzer_*` files test similar behavior
  - Lint tests scattered across 6 files

### 5. Missing Test Infrastructure

- **No shared test utilities module**
- **No test-specific compiler wrapper** (always captures output)
- **No compiler artifact caching** between test files
- **No parallel-safe stdout capture** at global level

---

## Proposed Solutions

### Phase 1: Output Capture (Immediate — High Impact)

**Goal**: Eliminate all compiler diagnostic noise from test output

**Tasks**:

1. Create `src/test/ts/test_utils.ts` with:
   - Unified `captureStdout<T>(fn: () => T): { value: T; stdout: string; stderr: string }`
   - `runCompiler(args: string[]): CompilerResult` wrapper that always captures
   - `runLinter(args: string[]): LinterResult` wrapper
2. Replace all `captureStdout` duplicates with shared utility (10+ files)

3. Update tests that call `tuffc.main()` or `fluff.main()` directly:
   - `selfhost.test.ts`
   - `selfhost_types.test.ts`
   - `selfhost_multifile_support.test.ts`
   - `tuff_tests_runner.test.ts`
   - All `selfhost_analyzer_*.test.ts` files that don't capture

**Acceptance**: `npm test` produces <50 lines of output for passing runs

---

### Phase 2: Compiler Caching (Medium Priority — Performance)

**Goal**: Reduce test runtime by 40-60% (target: <15s)

**Tasks**:

1. Extend `selfhost_helpers.ts` with:

   ```typescript
   // Cache compiled stage2 compiler in memory per test run
   let cachedStage2Compiler: { tuffc: any; fluff: any; timestamp: number } | null = null;

   async function getCachedStage2Compiler(outDir: string): Promise<...> {
     if (cachedStage2Compiler && isFresh(cachedStage2Compiler.timestamp)) {
       return cachedStage2Compiler;
     }
     // Build once, reuse across test files
   }
   ```

2. Update `buildStage2Compiler()` helper used in ~20 test files to use cache

3. Add environment variable `TUFF_TEST_NO_CACHE=1` to bypass for debugging

**Acceptance**:

- Test suite completes in <15s
- Cache invalidation works when prebuilt changes

---

### Phase 3: Test Organization (Low Priority — Maintainability)

**Goal**: Group related tests, reduce file count

**Tasks**:

1. Consolidate analyzer tests:

   - Merge `selfhost_analyzer_types.test.ts` + `selfhost_analyzer_primitives_ops.test.ts` → `selfhost_analyzer_type_checking.test.ts`
   - Merge `selfhost_analyzer_fn_values.test.ts` + `selfhost_analyzer_fn_value_calls.test.ts` + `selfhost_analyzer_generic_fn_values_rejected.test.ts` → `selfhost_analyzer_functions.test.ts`

2. Consolidate lint tests:

   - Create `selfhost_lint.test.ts` with nested `describe()` blocks:
     - "unused locals"
     - "unused params"
     - "complexity"
     - "file size"
     - "config"
   - Keep separate: `selfhost_lint_only.test.ts` (integration test)

3. Target: Reduce from 38 → ~25 test files

---

### Phase 4: Testing Best Practices (Documentation)

**Goal**: Prevent regressions in test quality

**Tasks**:

1. Add `TESTING.md` guide:

   - When to use `runCompiler()` vs direct `tuffc.main()`
   - How to write fast tests (use caching, avoid file I/O)
   - Naming conventions for test files
   - How to debug failing tests

2. Add pre-commit hook (optional):
   - Warn if new test doesn't use `captureStdout` or `runCompiler`

---

## Implementation Priority

### Week 1 (Immediate)

- [ ] Create `test_utils.ts` with `captureStdout` + wrappers
- [ ] Replace duplicated `captureStdout` in 10+ files
- [ ] Fix tests calling `tuffc.main()` without capture (~8 files)
- [ ] Verify output is <50 lines for passing run

### Week 2 (Performance)

- [ ] Implement compiler caching in `selfhost_helpers.ts`
- [ ] Update `buildStage2Compiler()` calls to use cache
- [ ] Measure runtime improvement (target: 40% faster)

### Week 3 (Organization — Optional)

- [ ] Consolidate analyzer test files (8 → 3)
- [ ] Consolidate lint test files (6 → 2)
- [ ] Write `TESTING.md` documentation

---

## Success Metrics

**Before**:

- Test output: 500+ lines (with warnings)
- Test runtime: ~26s
- Code duplication: 10+ `captureStdout` implementations
- Test files: 38

**After (Phase 1)**:

- Test output: <50 lines (passing run)
- Test runtime: ~26s (unchanged)
- Code duplication: 0 (shared utility)
- Test files: 38

**After (Phase 2)**:

- Test output: <50 lines
- Test runtime: <15s (40% improvement)
- Code duplication: 0
- Test files: 38

**After (Phase 3)**:

- Test output: <50 lines
- Test runtime: <15s
- Code duplication: 0
- Test files: ~25 (30% reduction)

---

## Non-Goals (Out of Scope)

- Rewriting tests to use a different framework (Vitest is fine)
- Adding snapshot testing (premature for bootstrap phase)
- Mocking/stubbing (compiler is the real implementation)
- Code coverage tracking (not needed yet)
- CI/CD integration (separate concern)

---

## Open Questions

1. **Should we cache across test runs?** (e.g., write stage2 to .cache/ directory)
   - Pro: Even faster (~5s total)
   - Con: Cache invalidation complexity
2. **Should we suppress `# suite:` output from .tuff tests?**

   - Pro: Further reduces noise
   - Con: Useful for debugging .tuff test failures

3. **Should we add a `--quiet` mode to tuffc/fluff?**
   - Pro: Cleaner than stdout interception
   - Con: Requires compiler changes, less flexible

---

## Next Steps

**Action Required**: Review this plan and prioritize phases.

**Recommended Start**: Phase 1 (Output Capture) — highest impact, lowest risk.

Run: `git add TESTING_IMPROVEMENTS.md && git commit -m "docs: testing improvement plan"`
