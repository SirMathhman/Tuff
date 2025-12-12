# Tuff compiler AST refactor (phased)

This repo currently has a working selfhost compiler pipeline, but the _effective AST_ is largely “string IR” (parser produces JS snippets like `ParsedExpr(v0: String, v1: I32)`). That blocks adding new backends.

This plan refactors toward a **canonical, target-agnostic AST**, while keeping today’s behavior stable and keeping the current target restricted to **JS only** for now.

## North-star architecture

- **Front-end**: Lexer/Parser produce a canonical AST (no backend strings).
- **Middle-end**: Analyzer performs name resolution + type checking and annotates the AST.
- **Back-end(s)**: Emitter(s) convert AST → target output.
  - Implemented now: **JS emitter**
  - Planned later: **C emitter**, **Tuff emitter** (self-hosting)

Design principles:

- Keep **Span/position** on nodes for diagnostics.
- Keep the AST **independent of JS syntax**.
- Allow future emitters by keeping emitter logic behind an interface (or per-target modules).

## Phase 0 (done)

- Diagnostics correctness and test stability (example: location-aware warnings).

## Phase 1: Introduce canonical AST module (now)

Goal: Add a new canonical AST definition without changing compilation behavior yet.

Deliverables:

- `src/main/tuff/compiler/ast.tuff` defines:
  - `Span` (start/end offsets) and `Ident`.
  - `TypeRef` (syntactic type references) and core nodes:
    - `Expr` variants (literals, ident, call, block, if, match, etc.).
    - `Stmt` variants (let, assign, while, expr-stmt, return/yield).
    - `Decl` variants (fn, struct, type/union, module/import).
  - Minimal helper functions used by tests (e.g., `expr_kind`, `span_len`).
- A smoke test in `src/test/tuff/*.test.tuff` that:
  - Imports the AST module and exercises constructing nodes + pattern matching.

Acceptance criteria:

- `bun test` passes.
- No change to the emitted JS of the existing compiler pipeline yet.

## Phase 2: Split `tuffc_lib.tuff` into modules (mechanical)

Goal: Reduce the monolith without changing semantics.

Status: done.

Initial extractions:

- `src/main/tuff/compiler/diagnostics.tuff` — diagnostics helpers + per-file mutable state
- `src/main/tuff/compiler/lexing.tuff` — whitespace/comment skipping + ASCII predicates

Further extractions:

- `src/main/tuff/compiler/parsing_primitives.tuff` — keyword/ident/number/module-path helpers
- `src/main/tuff/compiler/parsing_types.tuff` — minimal type-expression parsing helpers
- `src/main/tuff/compiler/parsing_expr_stmt.tuff` — expression + statement parsing helpers
- `src/main/tuff/compiler/parsing_decls.tuff` — extern/import/struct/type/fn/module parsing helpers

Extract into focused modules (names approximate):

- `diagnostics.tuff` (panic_at, line/col, warnings)
- `lexing.tuff` (skip_ws, starts_with_at, basic scanning)
- `parse_expr.tuff`, `parse_stmt.tuff`, `parse_decl.tuff`, `parse_type.tuff`
- `compile_project.tuff` (multi-file driver)

Acceptance criteria:

- Same behavior, same tests pass.

## Phase 3: Parser emits canonical AST (still JS-only output)

Goal: Replace string-based Parsed\* outputs with canonical AST nodes.

Steps:

- Keep the current parsing strategy, but return `ast::Expr/Stmt/Decl` instead of JS strings.
- Ensure spans are plumbed through.

Acceptance criteria:

- New AST-path parser exists and is used by the compilation pipeline.
- Existing tests pass.

## Phase 4: Analyzer pass (type + scope)

Goal: Add name resolution, forbid shadowing, type-check core constructs, and annotate nodes.

Acceptance criteria:

- Analyzer produces consistent diagnostics and is covered by tests.

## Phase 5: Emitters

- Phase 5a: **JS emitter** consumes analyzed AST → ESM.
- Phase 5b (later): **C emitter**.
- Phase 5c (later): **Tuff emitter** (enables deeper self-hosting).

Acceptance criteria:

- JS emitter becomes the default path.
- Backends are additive; the parser/analyzer remain unchanged.
