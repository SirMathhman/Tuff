# Tuff Compiler — Backend Development Roadmap

**Goal:** Implement three compilation backends:

1. ✅ **JavaScript** (Phase 5a — complete)
2. 🚧 **C** (Phase 5b — not started)
3. 🚧 **Tuff** (Phase 5c — self-hosting, not started)

**Philosophy:** Focus exclusively on what drives backends. Ignore optimizations, tooling, and features that don't unblock compilation to JS, C, or Tuff.

---

## Current State

- ✅ **Bootstrap Complete** — Compiler is self-hosting
- ✅ **Phase 4 Complete** — Type checking, generics, union narrowing, array safety
- ✅ **Phase 5a Complete** — JS backend functional; parenthesis optimization done
- 🚧 **Phase 5b/5c Planned** — C and Tuff backends not yet started

---

## Blockers Analysis

### What ACTUALLY Blocks Backend Development

| Task                     | JS  | C   | Tuff | Include?                             |
| ------------------------ | --- | --- | ---- | ------------------------------------ |
| Type system completeness | ✅  | ✅  | ✅   | **YES** — foundational               |
| Multi-file compilation   | ✅  | ✅  | ✅   | **YES** — real programs need modules |
| Stdlib I/O layer         | ✅  | ✅  | ✅   | **YES** — programs must do something |
| C emitter impl           | —   | ✅  | —    | **YES** — Phase 5b                   |
| Tuff emitter impl        | —   | —   | ✅   | **YES** — Phase 5c                   |

### What We're SKIPPING (Waste of Time)

| Task                                     | Why                                         |
| ---------------------------------------- | ------------------------------------------- |
| JS emitter micro-optimization            | JS is fast enough; don't premature-optimize |
| Stdlib collections (Vec, HashMap)        | Not on critical path for backends           |
| Test infrastructure cleanup              | Doesn't unblock anything                    |
| EBNF grammar system                      | Nice tooling; doesn't ship backends         |
| IDE/LSP support                          | Bonus feature; not a blocker                |
| Advanced types (traits, dependent types) | Defer to later phases                       |

---

## Implementation Plan (9-12 Weeks)

### Phase 1: Type System & Modules (Weeks 1-2)

**Goal:** Solidify foundations for all backends

**Tasks:**

- [ ] Implement lifetime tracking (borrow checking basics for C backend)
- [ ] Add platform types: `U8`, `U16`, `U32`, `U64`, `I8`, `I16`, `I64`, `F64`
- [ ] Fix cross-module type checking (ensure types match across files)
- [ ] Validate export/import semantics
- [ ] Add type checking tests for multi-file projects

**Why:** Both C and Tuff backends need accurate type information for code generation

**Definition of Done:**

- Multi-file Tuff projects compile without type errors
- Platform types are available and correctly sized
- Tests validate type compatibility across module boundaries

**Effort:** 2 weeks

---

### Phase 2: I/O & File System (Weeks 3-4)

**Goal:** Give programs useful capabilities

**Tasks:**

- [ ] Implement file I/O: `read_file()`, `write_file()`
- [ ] Add command-line argument parsing (`argv`)
- [ ] Implement exit code handling (`exit(code)`)
- [ ] Add environment variable access (`env_var()`)
- [ ] String manipulation: `split()`, `trim()`, `replace()`, `contains()`
- [ ] Create tests for I/O operations

**Why:** Real programs need I/O; enables testing and validation of backends

**Definition of Done:**

- Tuff programs can read/write files
- Programs can parse command-line arguments
- I/O operations work across all three backends (JS, C, Tuff)

**Effort:** 2 weeks

---

### Phase 3: C Backend (Weeks 5-8)

**Goal:** Second compilation target complete

**Milestones:**

**3a: Code Generation Foundation (Week 5-6)**

- [ ] Design AST → C type mapping
- [ ] Implement expression code generation
- [ ] Implement statement code generation
- [ ] Implement function declaration code generation
- [ ] Basic struct/union mapping to C types

**3b: Memory Management (Week 6-7)**

- [ ] Decide on memory model (manual or GC wrapper)
- [ ] Implement allocation/deallocation semantics
- [ ] Add lifetime checking validation
- [ ] Handle string/array heap allocations

**3c: Interop & Testing (Week 7-8)**

- [ ] C FFI support (call C functions from Tuff)
- [ ] Generate linkable C object files
- [ ] Create test suite: compile Tuff → C → native via GCC
- [ ] Validate compiled output matches JS backend behavior

**Definition of Done:**

- Sample Tuff programs compile to valid C code
- Generated C compiles to working native executables
- Output behavior matches JS backend
- Can call C standard library functions

**Effort:** 4 weeks

---

### Phase 4: Tuff Backend / Self-Hosting (Weeks 9-12)

**Goal:** Self-hosting complete; compiler can emit Tuff code

**Milestones:**

**4a: AST → Tuff Mapping (Week 9-10)**

- [ ] Design code generation strategy
- [ ] Implement expression code generation
- [ ] Implement statement code generation
- [ ] Implement declaration code generation
- [ ] Add pretty-printing with formatting

**4b: Validation & Integration (Week 10-12)**

- [ ] Test: emit valid Tuff source code
- [ ] Test: emitted code can be parsed and compiled
- [ ] Test: emitted code produces same behavior as original
- [ ] Validate: compiler can compile itself to Tuff, then compile that Tuff to JS/C
- [ ] Verify bootstrap chain: Tuff → Tuff → JS/C

**Definition of Done:**

- Compiler can emit valid, compilable Tuff code
- Emitted Tuff passes type checking and analysis
- Compilation chain works: original Tuff → emitted Tuff → JS/C
- Full bootstrap story demonstrated

**Effort:** 4 weeks

---

## Success Criteria

By **end of Week 12**, we have:

1. ✅ **Type System Ready** — Lifetime tracking, platform types, cross-module validation
2. ✅ **I/O Complete** — File operations, argv, environment, strings
3. ✅ **C Backend Functional** — Tuff programs compile to native code
4. ✅ **Tuff Backend Functional** — Compiler emits valid Tuff source
5. ✅ **All Three Backends Working** — JS ✓, C ✓, Tuff ✓
6. ✅ **Bootstrap Complete** — Compiler can compile itself to all three targets

---

## Detailed Work Breakdown

### Week 1-2: Type System & Modules

**File:** `src/main/tuff/compiler/analyzer/`

1. **Lifetime tracking** (3-4 days)

   - Add lifetime parameters to function signatures: `fn borrow<'a>(x: &'a T) -> &'a T`
   - Implement basic lifetime checking (no use-after-free)
   - Add tests for lifetime validation

2. **Platform types** (1-2 days)

   - Add type variants: `U8`, `U16`, `U32`, `U64`, `I8`, `I16`, `I64`, `F64`
   - Ensure parser/analyzer recognize these types
   - Add size mappings for C backend

3. **Cross-module type validation** (2-3 days)
   - Ensure exported types are checked in importing files
   - Validate function signatures match across modules
   - Add tests for multi-file type checking

**Test Files:**

- `src/test/tuff/lifetime.test.tuff`
- `src/test/tuff/platform_types.test.tuff`
- `src/test/ts/selfhost_multifile_types.test.ts`

---

### Week 3-4: I/O & File System

**Files:**

- `src/main/tuff/std/io.tuff` (expand existing)
- `src/main/tuff/std/string.tuff` (new)
- `rt/stdlib.ts` (runtime support)

1. **File I/O** (2-3 days)

   ```tuff
   extern fn read_file(path: String) : String
   extern fn write_file(path: String, content: String) : Void
   ```

2. **System access** (1-2 days)

   ```tuff
   extern fn argv() : Vec<String>
   extern fn exit(code: I32) : Void
   extern fn env_var(name: String) : String
   ```

3. **String utilities** (1-2 days)
   ```tuff
   fn split(s: String, delim: String) : Vec<String>
   fn trim(s: String) : String
   fn replace(s: String, old: String, new: String) : String
   fn contains(s: String, sub: String) : Bool
   ```

**Test Files:**

- `src/test/tuff/io.test.tuff`
- `src/test/tuff/string_utils.test.tuff`

---

### Week 5-8: C Backend

**New Directory:** `src/main/tuff/compiler/emit/c/`

**Files to create:**

- `c_emitter.tuff` — Main C code generator
- `c_types.tuff` — Type mapping (Tuff → C)
- `c_memory.tuff` — Memory management codegen
- `c_ffi.tuff` — C function interop

**Key Functions:**

```tuff
out fn emit_program_to_c(decls: Vec<Decl>) : String
out fn emit_decl_c(d: Decl) : String
out fn emit_expr_c(e: Expr) : String
out fn emit_stmt_c(s: Stmt) : String
```

**Integration Points:**

- Add C target to `tuffc.tuff` CLI (`--target c`)
- Add C backend to `tuffc_lib.tuff` orchestrator
- Create GCC/Clang invocation wrapper

**Test Files:**

- `src/test/ts/c_backend.test.ts` — Compile Tuff to C, verify output
- `src/test/tuff/c_interop.test.tuff` — Call C functions

---

### Week 9-12: Tuff Backend / Self-Hosting

**New Directory:** `src/main/tuff/compiler/emit/tuff/`

**Files to create:**

- `tuff_emitter.tuff` — AST → Tuff code generator
- `tuff_formatter.tuff` — Pretty-printing utilities

**Key Functions:**

```tuff
out fn emit_program_to_tuff(decls: Vec<Decl>) : String
out fn emit_decl_tuff(d: Decl) : String
out fn emit_expr_tuff(e: Expr) : String
out fn emit_stmt_tuff(s: Stmt) : String
```

**Integration Points:**

- Add Tuff target to `tuffc.tuff` CLI (`--target tuff`)
- Add Tuff backend to `tuffc_lib.tuff` orchestrator
- Create self-compilation test suite

**Test Files:**

- `src/test/ts/tuff_backend.test.ts` — Emit Tuff code, verify parseable
- `src/test/ts/selfhost_bootstrap.test.ts` — Compiler → Tuff → JS/C chain

---

## Dependencies & Sequencing

```
Week 1-2: Type System & Modules
    ↓ (blocks)
Week 3-4: I/O & File System
    ↓ (enables testing)
Week 5-8: C Backend (can proceed in parallel with earlier phases)
    ↓ (independent)
Week 9-12: Tuff Backend
    ↓
Bootstrap Complete ✓
```

---

## Rollout Strategy

### After Week 2 (Type System)

- Merge type system changes to `master`
- Update compiler documentation
- Tag as `v0.5.0-types` (pre-release)

### After Week 4 (I/O)

- Merge I/O and string utilities
- Update stdlib documentation
- Tag as `v0.5.0-io` (pre-release)
- Sample programs can now do useful work

### After Week 8 (C Backend)

- Merge C backend
- Add CLI documentation for `--target c`
- Tag as `v0.6.0` (feature release)
- Announce second backend

### After Week 12 (Tuff Backend)

- Merge Tuff backend
- Update bootstrap documentation
- Tag as `v0.7.0` (major milestone)
- Announce self-hosting completion
- Celebrate 🎉

---

## Risks & Mitigations

### Risk: Lifetime tracking too complex

**Mitigation:** Start with simplified model (no elision, explicit annotations). Full Rust-like checking can come later.

### Risk: C code generation produces incorrect output

**Mitigation:** Extensive testing against JS backend. Create reference test suite that validates behavior identity.

### Risk: Tuff emitter produces unparseable code

**Mitigation:** Emit with explicit parentheses/formatting. Validate output by parsing immediately after generation.

### Risk: Self-compilation creates circular dependency

**Mitigation:** Keep bootstrap chain simple. Prebuilt compiler continues to work; new Tuff target is additive.

---

## Success Metrics

- [ ] All type system tests pass
- [ ] Multi-file projects compile correctly
- [ ] I/O operations work in all backends
- [ ] C-compiled programs run natively
- [ ] Tuff backend emits valid, parseable code
- [ ] Bootstrap chain works: Tuff → Tuff → JS/C
- [ ] **Zero features beyond these three backends added in this period**

---

## What We're NOT Doing

- ❌ Optimizing generated JavaScript
- ❌ Building collections library (Vec, HashMap)
- ❌ Improving test infrastructure
- ❌ Building EBNF grammar tooling
- ❌ IDE/LSP integration
- ❌ Macro system
- ❌ Advanced type features

These are for **later phases**. Focus now is **backends**.

---

## Recommended Start

**Begin Week 1 with:**

1. Add platform types (`U8`, `U16`, `U32`, `U64`, `I8`, `I16`, `I64`, `F64`)
2. Implement basic lifetime tracking in type system
3. Fix cross-module type validation

This creates a solid foundation for C backend work (Week 5).

**Then Week 3:** 4. Implement file I/O and string utilities 5. This enables realistic test programs

**Then Week 5:** 6. Begin C backend implementation

---

## References

- Compiler README: [`src/main/tuff/compiler/README.md`](src/main/tuff/compiler/README.md)
- Analyzer README: [`src/main/tuff/compiler/analyzer/README.md`](src/main/tuff/compiler/analyzer/README.md)
- Test Structure: [`src/test/README.md`](src/test/README.md)
- Project Status: [`README.md`](README.md)

---

**Last Updated:** December 16, 2025
**Status:** Ready to implement
**Next Steps:** Start Phase 1 (Type System & Modules)
