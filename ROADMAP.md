# Tuff Long-Term Roadmap

Tuff's vision is to become a versatile systems programming language with multiple compilation targets and a comprehensive standard library.

## Core Vision

### 1. Comprehensive Standard Library

The standard library will provide essential building blocks for systems programming:

- **Collections**: `Vec`, `HashMap`, `BTreeMap`, `LinkedList`, `HashSet`, `BTreeSet`
- **String utilities**: split, replace, trim, case conversion, parsing
- **Math functions**: sqrt, sin, cos, floor, ceil, pow, log, trigonometric functions
- **File I/O and system utilities**: file operations, path handling, environment variables
- **Networking and concurrency primitives** (future): TCP/UDP, channels, threads
- **Rich iterator and functional programming utilities**: map, filter, fold, reduce, zip, etc.

### 2. Multi-Target Emission

Tuff will compile to multiple targets, enabling use across different domains:

- **JavaScript (ES Modules)** ✓ — Current and primary target; enables web and Node.js development
- **C** (planned) — For systems programming, embedded systems, and interop with native code; enables performance-critical applications
- **Tuff** (planned) — Self-hosting at the backend level; Tuff→Tuff compilation for meta-programming and advanced optimizations

## Implementation Strategy

### Phase 5-6: Standard Library Expansion

**Timeline**: Q1-Q3 2026

- Build out collections with efficient implementations
- Develop string utilities and parsing helpers
- Implement math module with common functions
- Create `std::iter` with functional combinators (map, filter, fold, etc.)
- Add file I/O via FFI (initially JS/node, later native)
- Establish patterns for pure Tuff stdlib modules vs. FFI-based modules

**Success Criteria**:
- Collections (Vec, HashMap) have full feature parity with Rust/Python equivalents
- Iterator library is rich and composable
- stdlib can support real-world applications (CLI tools, data processing)

### Phase 7-8: C Backend

**Timeline**: Q3 2026-Q2 2027

- Implement C emitter alongside JS emitter (parallel target in compiler)
- Support low-level features: pointers, manual memory management (optional), struct layouts
- Enable FFI between Tuff (compiled to C) and existing C libraries
- Target: single-language solution for web, CLI, and systems programming
- Optimize C output for readability and performance

**Key Challenges**:
- Memory management semantics (garbage-collected Tuff → manual C)
- FFI boundary semantics
- Compile-time vs. runtime behavior differences

**Success Criteria**:
- Can compile standard library to both JS and C
- C output performs comparably to hand-written C for core algorithms
- Existing C libraries can be wrapped and used from Tuff

### Phase 9+: Tuff Backend & Advanced Features

**Timeline**: 2027+

- Implement Tuff→Tuff compiler (self-hosting at emission level)
- Enable compile-time meta-programming and code generation
- Support optional advanced features: custom allocators, inline assembly (for C backend)
- Unified compiler that can emit JS, C, and Tuff as first-class targets

**Stretch Goals**:
- Verified compilation (proofs of correctness for compilation stages)
- Integrated optimization passes (constant folding, dead code elimination, etc.)
- LLVM backend for native compilation

## Community & Ecosystem

### Libraries & Frameworks

- Foster community libraries for web, CLI, systems programming
- Establish patterns for Tuff→JS and Tuff→C libraries
- Curate high-quality, well-documented library ecosystem

### Package Management

- Design and implement package registry (versioning, dependency resolution)
- Enable reproducible builds and dependency locking
- Support semantic versioning and breaking change management

### Developer Tools

- **IDE/Editor Support**: Language Server Protocol (LSP) for VS Code, Vim, Emacs, Neovim
- **Debuggers**: Integration with existing debuggers (lldb, gdb, node inspector)
- **Profilers**: Performance analysis tools for compiled output
- **Formatter & Linter**: Code style enforcement and best-practice checking

### Education & Documentation

- Comprehensive language book (The Tuff Guide)
- Tutorial series: from hello world to systems programming
- Real-world case studies and examples
- Performance comparison benchmarks (Tuff vs. Rust, C, Go, etc.)

## Current Priorities

The project is currently focused on:

1. **Phase 4 Completion** (in progress) — Full type system, analyzer refinement
2. **Phase 5a** (next) — JS emitter optimization
3. **Foundation for Phase 5-6** — Design stdlib architecture and collection APIs

Phase 5a has begun with correctness-focused emitter work:

- Preserve standalone expression statements (`SExpr`) so side-effecting calls are not dropped
- Fix unary operator precedence emission (e.g. emit `!(a < b)` safely as `!((a < b))`)

## Feedback & Contributions

This roadmap is a living document. The community is invited to:

- Discuss priorities and timelines
- Contribute implementations for stdlib modules
- Provide use-case feedback and real-world requirements
- Build experimental backends and features

---

**Last Updated**: December 2025  
**Maintained by**: Tuff Core Team
