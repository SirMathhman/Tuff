# Tuff Compiler Plan

## Executive summary

- Build Tuff as a multi-backend compiler with a CST-backed parser for lossless formatting, a typed AST and a typed/SSA IR for semantics and optimizations, and backends that emit JavaScript (ES modules + source maps) and native code (LLVM IR / optional WebAssembly).
- Preferred stack: compiler core written in Tuff itself eventually; initially implement a Stage0 reference compiler in a stable host (recommended: Rust) for bootstrapping. Use TypeScript for editor/formatting tooling when convenient.
- MVP: grammar + CST, parsing + round-trip printing, typechecker, JS backend + runtime + stdlib, canonical formatter, LSP skeleton, CI and tests.
- Start with a simple typed language subset for fast iteration; adopt more advanced IR (MLIR) only if needed later.

---

## 1) High-level architecture

Parser / CST (tree-sitter for editor usage and a full CST for printing)
→ CST → Surface AST → Typed AST (desugared)
→ Typed IR → Mid-level SSA-like IR (value-based)
→ Backend(s):

- JS Backend: emit ESTree/Babel AST → JS source (+ source maps)
- Native Backend: lower to LLVM IR (via LLVM bindings) → object/binary

Runtime / Stdlib (shared abstractions + per-target shims)
Tooling: formatter (AST-preserving), LSP, tests, packaging

Rationale:

- Keep CST to preserve comments and formatting for Tuff→Tuff canonicalization and safe refactors.
- Typed AST early to provide helpful diagnostics and make lowering to IR straightforward.
- Mid-level SSA IR provides a target that can be optimized and lowered to either JS or LLVM.

---

## 2) Parsing, CST & AST design

- Use **tree-sitter** for editor integration and fast reparse; maintain a full parser (or a generator parser) that yields a CST for printing.
- Surface AST: close to syntax. Typed/Core AST: desugared and annotated with types. Keep links to CST nodes (positions) for accurate diagnostics, formatting, and source maps.
- Implement a small verifier and robust error messages; design AST nodes to carry metadata for later transforms and canonicalization.

---

## 3) IR choices & codegen strategies

IR decisions:

- Start with a **typed IR** and a small SSA-like mid-IR; support basic optimizations (constant fold, inlining, simple CSE).
- MLIR is optional—adopt it later for heavy multi-target optimization.

JS backend:

- Emit JS AST (ESTree/Babel). Use a generator (e.g., Babel or escodegen) to produce source and source maps. Target ES modules and provide interop shims for runtime features.
- Use host GC and JS idioms for collection and data structures.

LLVM/native backend:

- Lower SSA IR to LLVM IR via bindings (Rust: inkwell or llvm-sys). Emit bitcode or object files and link a small runtime.
- For wasm, either from LLVM or emit wasm directly with Binaryen/wasm-tools when small size and wasm idioms are important.

Runtime:

- Design a platform-abstract runtime API (alloc/free, panics, I/O). JS backend maps to JS runtime and GC; native backend provides a simple runtime (RC or small tracing GC initially).

---

## 4) Formatter, refactoring & LSP

- Implement an **AST-preserving pretty-printer** (recast-style) that uses CST to preserve unchanged formatting/comments. Provide a canonicalizer mode to normalize stylistic choices.
- Language Server: implement LSP (diagnostics, formatting, symbol navigation, rename). Use `tower-lsp` (Rust) or `vscode-languageserver` (TypeScript) depending on where tooling lives.

---

## 5) Testing, CI & releases

Testing strategy:

- Unit tests for parser, typechecker, IR transforms.
- Golden tests for formatting, codegen and outputs (snapshot tests).
- Integration tests: compile small programs, run them in Node / wasm / native and assert behavior.
- Round-trip tests: parse→print→parse and parse→canonicalize→print invariants.
- Fuzzing and property-based tests for parser/IR invariants.

CI & packaging:

- GitHub Actions matrix (Windows/macOS/Linux) for builds and tests; include cross-compiles for native backend builds.
- Publish JS artifacts to npm; native binaries via GitHub Releases (optionally Homebrew/scoop/apt later).

---

## 6) Implementation language tradeoffs

- **Rust (recommended for core)**: performance, excellent LLVM and wasm integrations, strong ecosystem for tooling (inkwell, tower-lsp).
- **TypeScript**: great for quick editor tooling and pretty-printer, works well for VS Code extensions and npm packaging.
- **OCaml/Haskell**: excellent for complex type systems, but smaller ecosystems for packaging and LLVM integration.

Recommendation: use Rust for compiler core and critical backend work; TypeScript for editor UX and formatters if that speeds development.

---

## 7) Backends: JS, LLVM, Tuff→Tuff

JS Backend specifics:

- Emit ES modules and source maps; produce small runtime shims and provide good dev DX (stack traces mapped to sources).
- Expose FFI as named exports and support idiomatic JS interop.

LLVM Backend specifics:

- Use LLVM IR lowering and emit DWARF for debugging. Provide a simple runtime to begin with and plan to evolve memory/GC strategy later.
- Provide C-ABI wrappers for FFI and developer-friendly tools for native packaging.

Tuff→Tuff formatting/refactoring:

- Use CST-based printer with selective reprinting to preserve formatting.
- Implement a canonicalizer for deterministic reprints used in formatting and for stable bootstrap artifacts.

---

## 8) Risks & mitigations

- Scope creep: mitigate by defining a lean MVP and feature gates.
- Backend divergence (JS vs native): mitigate by defining a canonical semantic spec and strong cross-target tests.
- Memory model mismatch: provide a small runtime abstraction and start with simple but documented semantics.
- Loss of comments/formatting: maintain a CST and AST-preserving printer; use extensive round-trip tests.

---

## 9) Milestone roadmap (MVP-focused)

Assumes 2–3 engineers; estimates in person-months (pm).

1. Spec + Parser + CST + Round-trip tests — 1.5–2 pm

   - Deliverables: spec draft, tree-sitter grammar, CST, parse/print tests, canonicalizer baseline.

2. Typechecker + Typed AST + Typed IR — 1.5–2 pm

   - Deliverables: type system implementation, verifier, typed IR, test coverage.

3. JS Backend + Runtime + Stdlib (MVP release) — 2 pm

   - Deliverables: ES module codegen with source maps, npm package with runtime shims, integration tests.
   - MVP defined: subset compiles to JS, typechecker working, canonical formatter, LSP basics, CI.

4. Native Backend (LLVM) + FFI + Cross-platform Releases — 2–3 pm

   - Deliverables: LLVM backend, runtime for native, cross-platform build pipelines.

5. Tooling polish: LSP features, formatter, fuzzing, performance tuning — 1–2 pm
   - Deliverables: complete LSP, robust formatter, fuzz harnesses, benchmarks.

Total MVP→native-ready: ~10–14 pm.

---

## 10) Open questions

1. Typing model: static with inference, explicit static types, or dynamic? Specific features (sum types, ownership)?
2. Memory model for native: reference counting / tracing GC / borrow-style?
3. Primary target platforms: browser/Node, native desktop, or WASM-first?
4. Interop expectations: ergonomics for JS & native FFI?
5. Module/packaging: ES modules + npm primary, custom package manager, or both?
6. Timeline & team size: aggressive or moderate schedule?
7. Must-have features in MVP (async, generics, macros)?

---

# Bootstrapping to a self-hosting (Tuff-of-Tuff) compiler

## Executive summary

- Use a staged bootstrap: Stage0 (host reference) → Stage1 (minimal compiler) → Stage2 (first Tuff-written compiler compiled by Stage1) → Stage3 (full Tuff-of-Tuff).
- Start small: freeze a bootstrap subset and implement an interpreter or small compiler for quick validation.
- Enforce determinism and canonicalization to enable multi-stage verification and reproducible builds.

---

## 1) Common bootstrapping patterns

- Interpreter-first: fast validation, slower execution.
- Staged compiler: controlled increments (recommended).
- Cross-compilation: quicker target artifacts, but potential cross-target differences.
- Translator/subset: write compiler in a restricted subset of Tuff for initial self-hosting.

---

## 2) Suggested staged bootstrap sequence

Stage0 — Host-language Reference Compiler (Rust/Python/Go)

- Artifact: interpreter or small compiler for the bootstrap subset. Must pass core-spec tests.

Stage1 — Minimal Tuff Compiler (host or restricted Tuff subset)

- Artifact: compiler with frontend + simple codegen. Should compile test suite and Stage2 source.

Stage2 — Tuff compiled by Stage1 (first self-hosted build)

- Artifact: Tuff-written compiler compiled by Stage1. Run its outputs and validate against the test suite.

Stage3 — Full self-hosted compiler

- Artifact: stable full compiler written in Tuff; multi-stage bootstrap stabilizes artifacts.

Acceptance criteria for each stage: core tests pass; can compile next-stage compiler; canonicalization and reproducibility ensured.

---

## 3) Minimal subset for first self-host

Must-haves:

- tokens, identifiers, literals, functions, calls, local variables, basic control flow, module/file scoping, simple type system (or untyped initially)

Delay: generics, macros, complex module linking, advanced concurrency.

---

## 4) Testing & verification for bootstrapping

- Round-trip compile tests, double-compilation tests, translation validators, reproducible builds through canonicalizer, and a CI bootstrapping pipeline (StageN → StageN+1 → verification).

---

## 5) Tooling & infra

- Interpreter and transpiler targets for fast iteration, wasm/JIT for CI, snapshot tests, pinned environments (containers), and artifact signing for releases.

---

## 6) Migration & compatibility

- Feature gates, staged deprecations, compatibility matrices, maintain a stable Stage0 for recovery, and automated migration tests.

---

## 7) Risks & mitigations

- Language churn, non-determinism, debugging difficulty. Mitigate with freeze on bootstrap subset, canonicalizer, strong logging and test harnesses.

---

## 8) Bootstrapping roadmap (rough estimates)

1. M0 — Host reference & spec (2–4 weeks)
2. M1 — Stage1 minimal compiler + tests (4–8 weeks)
3. M2 — Stage2 first self-hosted + bootstrap tests (6–12 weeks)
4. M3 — Stabilization & reproducibility (4–8 weeks)
5. M4 — Full Tuff-of-Tuff + continuous bootstrap CI (6–12 weeks)

Total: ~4–11 months depending on team and scope.

---

## 9) Open questions specific to bootstrapping

1. Preferred host language for Stage0?
2. Interpreter-first acceptable or require native outputs early?
3. Determinism level (bitwise vs canonical equivalence)?
4. Target timeline and team size?
5. Must-have language features for the first self-hosted iteration?

---

# Next steps

- Decide Stage0 host language and freeze a minimal bootstrap subset.
- Create a minimal Stage0 impl (interpreter or tiny compiler) and core test-suite.
- Start Stage1 development with continuous bootstrap CI to validate progress.

---

_End of plan — ready for refinement._
