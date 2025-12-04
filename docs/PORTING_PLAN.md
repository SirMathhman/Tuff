# Tuff Compiler Self-Hosting Porting Plan

## Overview

Incrementally port the Tuff compiler from Rust to Tuff by rewriting each compiler phase one-at-a-time, starting with the simplest (Lexer) and building up to a fully self-hosting compiler. Each ported phase integrates with existing Rust infrastructure via FFI until complete bootstrap is achieved.

**Current Status:** Rust compiler fully functional with 61/61 tests passing. Compiler phases: Lexer (380 lines), Parser (550 lines), Type Checker (280 lines), Borrow Checker (450 lines), Code Generator (450 lines).

**Goal:** Create a Tuff compiler written entirely in Tuff that can compile itself.

---

## Phase 1: Bootstrap Lexer in Tuff

**Objective:** Port `src/compiler/lexer.rs` (~380 lines) to `tuff/lexer.tuff`

**Implementation:**
- Leverage existing character classification helpers from bootstrap example (`examples/bootstrap/lexer.tuff`)
- Build Token struct and TokenKind enum in Tuff
- Implement tokenization loop with keyword recognition, string/number parsing, comment handling
- Create Rust FFI wrapper that calls Tuff lexer and converts results to Rust Token format

**Validation:**
- Run all 10 lexer unit tests against Tuff implementation via wrapper
- Add integration test verifying output token stream matches original lexer
- Benchmark tokenization performance (should be comparable)

**Success Criteria:** All 10 unit tests pass; integration test passes

**Dependencies:** None (starting point)

---

## Phase 2: Build Lexer Support Library

**Objective:** Create minimal Tuff standard library for lexer needs

**Implementation:**
- Define Vec<T> equivalent (dynamic array)
- Define HashMap<K,V> equivalent (hash table, or simple array if performance acceptable)
- Implement String operations (concatenation, character access, length)
- Implement Option<T> and Result<T,E> types for error handling
- Create Span/location tracking structure matching Rust version

**Reusability Note:** These types become foundation for all subsequent compiler phases

**Success Criteria:** Lexer compiles without Rust std library dependencies

---

## Phase 3: Port Parser in Tuff

**Objective:** Rewrite `src/compiler/parser.rs` (~550 lines) in Tuff

**Implementation:**
- Use completed lexer (Phase 1) to tokenize input
- Build recursive descent parser with same structure as Rust version
- Implement AST node construction (Item, Statement, Expression, Pattern, Type)
- Add error recovery matching original behavior
- Reference existing parser bootstrap example (`examples/bootstrap/parser.tuff`) as implementation guide

**Validation:**
- Run through Rust FFI wrapper
- Validate 15 integration tests all pass (full pipeline: lexer → parser → type-checker → borrow-checker → codegen)
- Parse all bootstrap examples successfully

**Complexity Note:** Largest single phase; recursion and tree-building are core challenges

**Success Criteria:** All 15 integration tests pass

**Dependencies:** Phases 1-2 (lexer, support library)

---

## Phase 4: Port Type Checker in Tuff

**Objective:** Rewrite `src/compiler/type_checker.rs` (~280 lines) in Tuff

**Implementation:**
- Call completed lexer + parser
- Implement type inference for literals, variables, operators
- Build symbol table with scope management
- Validate type consistency in assignments and function calls
- Implement generic type handling (if applicable)

**Validation:**
- Run 12 existing unit tests via Rust FFI
- Verify type inference matches original behavior
- Test with all bootstrap examples

**Success Criteria:** All 12 unit tests pass; type inference output matches original

**Dependencies:** Phases 1-3 (lexer, parser, support library)

---

## Phase 5: Port Borrow Checker in Tuff

**Objective:** Rewrite `src/compiler/borrow_checker.rs` (~450 lines) in Tuff

**Implementation:**
- Call completed lexer + parser + type checker
- Implement ownership state machine (Available → ImmutablyBorrowed/MutablyBorrowed → Moved)
- Enforce move semantics and borrow rules
- Reference borrow checker logic from bootstrap example (`examples/bootstrap/types.tuff`)
- Track variable lifetimes and validate borrow validity

**Validation:**
- Run 10 existing unit tests via Rust FFI
- Verify borrow checking matches original (catches same violations, allows same patterns)
- Test with all bootstrap examples

**Complexity Note:** Most complex logic phase; state machine requires careful implementation

**Success Criteria:** All 10 unit tests pass; borrow checking behavior identical to original

**Dependencies:** Phases 1-4 (lexer, parser, type-checker, support library)

---

## Phase 6: Port Code Generator in Tuff

**Objective:** Rewrite `src/compiler/codegen.rs` (~450 lines) in Tuff

**Implementation:**
- Call completed lexer + parser + type-checker + borrow-checker
- Implement C code generation for:
  - Function definitions and calls
  - Type definitions and unions
  - Statements and expressions
  - Memory management (if applicable)
- Handle C output file writing

**Critical Feature:** C FFI strategy
- **Question:** How does Tuff invoke external processes (gcc)?
- **Option A:** Shell out via system call
- **Option B:** Create Tuff wrapper around C compiler API
- **Option C:** Delay gcc invocation to Rust wrapper

**Validation:**
- Run 10 existing unit tests via Rust FFI wrapper that handles gcc invocation
- Verify generated C code compiles with gcc
- Verify generated binaries produce same output as original
- Test with all bootstrap examples

**Self-Hosting Milestone:** Once complete, compiler can compile itself (theoretically)

**Success Criteria:** All 10 unit tests pass; bootstrap examples compile and run

**Dependencies:** Phases 1-5 (all previous phases)

---

## Phase 7: Create Full Tuff Compiler Binary

**Objective:** Write main Tuff program that orchestrates all phases

**Implementation:**
```tuff
// main.tuff - Tuff compiler entry point
fn main() {
    // Parse command-line arguments
    let source_file = ...
    
    // Read source
    let source = read_file(source_file)?
    
    // Lexer phase
    let tokens = lexer::tokenize(source)?
    
    // Parser phase
    let ast = parser::parse(tokens)?
    
    // Type checker phase
    type_checker::check(ast)?
    
    // Borrow checker phase
    borrow_checker::check(ast)?
    
    // Code generator phase
    let c_code = codegen::generate(ast)?
    
    // Write output and invoke gcc
    write_file(output_file, c_code)?
    invoke_gcc(output_file)?
}
```

**Integration:** This replaces `src/main.rs` as the canonical entry point once bootstrapped

**Success Criteria:** Full compilation pipeline works end-to-end in Tuff

**Dependencies:** Phases 1-6 (all compiler phases)

---

## Phase 8: Validate Bootstrap Loop

**Objective:** Achieve self-hosting via bootstrap compilation loop

**Implementation:**
1. Compile Tuff compiler (written in Tuff) using existing Rust compiler
2. Use resulting binary to recompile itself
3. Verify output binary identical (reproducible build)
4. Verify new self-compiled binary can recompile again
5. Update documentation with bootstrap instructions

**Validation Approach:**
```
Step 1: tuff_compiler_v1 (Rust) compiles tuff_compiler.tuff → tuff_compiler_v1_from_tuff (Tuff binary)
Step 2: tuff_compiler_v1_from_tuff compiles tuff_compiler.tuff → tuff_compiler_v2_from_tuff
Step 3: Verify tuff_compiler_v1_from_tuff ≈ tuff_compiler_v2_from_tuff (same binary or byte-for-byte identical)
Step 4: Verify tuff_compiler_v2_from_tuff can compile itself again (idempotent)
```

**Success Criteria:** Bootstrap loop closes; reproducible binary builds; self-hosting confirmed

**Dependencies:** Phases 1-7 (all prior work)

---

## Technical Considerations

### 1. Tuff Standard Library Requirements

**Minimal scope:** Only include what each compiler phase actually needs.

**Required types:**
- `Vec<T>` - Dynamic arrays (tokens, AST nodes, statements)
- `HashMap<K,V>` or `Vec<(K,V)>` - Symbol tables (type checker scope)
- `String` - Source code, identifier names, output C code
- `Option<T>` - Optional types (error handling)
- `Result<T,E>` - Error propagation
- `Span` - Location tracking (filename, line, column)

**Optional (Phase 2+ considerations):**
- `HashSet<T>` - If needed for borrow checker state tracking
- `BTreeMap<K,V>` - If deterministic ordering needed for output consistency

### 2. C FFI Strategy

**Decision point at Phase 6 (Code Generator):**

**Option A - Shell out (Simplest):**
```tuff
// Invoke gcc from Tuff
extern "C" fn system(cmd: &str) -> i32;
```
- Pro: Simple, no complex C wrapper needed
- Con: Platform-dependent, requires gcc in PATH

**Option B - Rust wrapper handles gcc (Safest):**
```rust
// Rust code in wrapper that calls Tuff codegen, then runs gcc
let c_code = tuff_codegen(ast);
std::process::Command::new("gcc").arg(output_file).spawn()?;
```
- Pro: Keep Tuff pure, Rust handles system complexity
- Con: Defers true self-hosting (gcc invocation still in Rust)

**Option C - Tuff-based gcc interface (Most ambitious):**
- Create Tuff bindings to GCC API
- Requires significant C interop infrastructure
- Highest effort, enables true complete self-hosting

**Recommendation:** Start with Option B (Rust wrapper) for Phase 6; can upgrade to Option A or C later if self-hosting closure is priority.

### 3. Error Handling During Porting

**Strategy:** Maintain Result<T,E> pattern throughout.

**Questions to answer as you port:**
- Should Tuff Result<T,E> be Rust-compatible or pure Tuff?
- How do Tuff errors propagate through Rust FFI wrapper?
- Should error messages be identical to original?

**Recommendation:** Keep errors simple (error codes + messages); don't worry about exact Rust compatibility during porting.

### 4. Intermediate Validation Approach

**Recommended:** Validate phases independently after each phase port, then test full pipeline.

**Workflow:**
```
Phase 1 complete → Run lexer unit tests (10) → Commit
Phase 2 complete → (No new tests; bootstraps Phase 1)
Phase 3 complete → Run parser/integration tests (15) → Full pipeline test → Commit
Phase 4 complete → Run type-checker unit tests (12) → Full pipeline test → Commit
Phase 5 complete → Run borrow-checker unit tests (10) → Full pipeline test → Commit
Phase 6 complete → Run codegen unit tests (10) → Bootstrap examples → Commit
Phase 7 complete → Full pipeline in Tuff → Commit
Phase 8 complete → Bootstrap loop verified → Commit with documentation
```

### 5. Fallback Strategy if Blocked

**If Tuff language features block a phase port:**

- **Option A:** Enhance Tuff language to support missing feature
  - Pros: Improves Tuff itself; enables complete bootstrap
  - Cons: Delays compiler porting; scope creep
  
- **Option B:** Accept Rust implementation for that phase
  - Pros: Unblocks forward progress; partial self-hosting acceptable
  - Cons: True self-hosting not achieved; maintenance burden splits languages
  
- **Option C:** Redesign compiler phase for Tuff constraints
  - Pros: Forces architectural improvement; might simplify code
  - Cons: Risky; could break existing tests

**Recommendation:** Start with Option C (redesign); escalate to A or B only if blocked for >1 day.

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Phases ported to Tuff | 6 (lexer-codegen) | 0 |
| Test pass rate | 100% (61/61) | 100% (61/61) ✓ |
| Bootstrap examples compiling | 4/4 | 4/4 ✓ |
| Self-hosting achieved | Yes | No |
| Lines of Rust compiler code | 0 | ~2,260 |
| Lines of Tuff compiler code | ~2,260 | ~500 (bootstrap examples) |
| Bootstrap loop closure | Verified | Not yet |

---

## Timeline Estimate

- **Phase 1 (Lexer):** 2-3 days (straightforward; well-understood token types)
- **Phase 2 (Support Library):** 1-2 days (minimal scope; reusable foundation)
- **Phase 3 (Parser):** 5-7 days (largest; complex recursion and tree-building)
- **Phase 4 (Type Checker):** 3-4 days (moderate complexity; symbol table logic)
- **Phase 5 (Borrow Checker):** 3-4 days (complex state machine; careful implementation)
- **Phase 6 (Code Generator):** 4-5 days (string generation; C output handling)
- **Phase 7 (Main orchestration):** 1 day (orchestrate completed phases)
- **Phase 8 (Bootstrap validation):** 1-2 days (testing and documentation)

**Total: 21-28 days** (roughly 3-4 weeks assuming part-time effort)

---

## Next Steps

1. **Review this plan** with team/stakeholders for feasibility and priority
2. **Confirm Tuff language feature set** available for self-hosting (recursion, FFI, generics, etc.)
3. **Decide on C FFI strategy** (shell out vs. Rust wrapper vs. full Tuff interface)
4. **Set up test infrastructure** for validating each ported phase
5. **Begin Phase 1:** Port lexer to Tuff; establish pattern for subsequent phases
6. **Publish progress** publicly (blog posts, commits, bootstrap examples)
