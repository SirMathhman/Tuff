# Tuff (`tuffc`) — Agent Instructions

Tuff is a small, statically typed, imperative language with a tree-walking
interpreter, written in Rust (edition 2024, no dependencies).

## Build & Verify

```powershell
cargo fmt                      # format (auto-fix, then --check)
cargo clippy --all-targets -- -D warnings   # lint, warnings are errors
cargo test                     # full test suite
```

Hooks in `.github/hooks/` enforce the gates: `format.ps1`, `lint.ps1`,
`test.ps1`, `pmd-cpd.ps1` (no duplicated code blocks, min 100 tokens),
`find-circular-files.ps1` (no circular `mod` dependencies), and
`cap-children-per-directory.ps1` (max 20 children per git-tracked
directory). Run the relevant hooks before committing.

## Architecture

Pipeline, strictly one-directional:
`source → lexer → parser → typeck → eval → value`, orchestrated by
`driver`. `ast` and `error` are shared leaves; no module depends on
`driver`.

- `typeck` is a whole-program static pass (types + mutability); it
  produces a typed AST that `eval` consumes. `eval` trusts `typeck` for
  all static facts and checks only dynamic ones (array bounds).
- Every error is a spanned `TuffError` variant in `error.rs`; never
  `panic!`/`unreachable!` on user-reachable paths.

The canonical architecture document is the repository-memory file
`/memories/repo/architecture.md` (view it with the memory tool) — it
describes the target architecture, not the current state. Consult it
before structural changes.

## Conventions

- **Size limits**: max 100 lines per function, 500 lines per file
  (ignoring blanks/comments), 10 files per directory. If a file is too
  long, split it — do not shrink it with whitespace.
- **Tests are immutable**: never modify or delete existing test cases;
  only add new ones. Tests live in `#[cfg(test)]` modules in each file;
  end-to-end tests go in `src/lib.rs` via `evaluate(...)`.
- **Docs**: `missing_docs` and clippy `missing_docs_in_private_items`
  are warnings — document every public and private item.
- **Commits**: imperative, specific messages (e.g. "Split typeck
  analyze/analyze_stmt into per-kind helpers"). Commit after each fix or
  phase, leaving a clean working tree.
- **Statement dispatch**: disambiguate statement kinds in the grammar
  (a `parse_stmt` entry point), not via ad-hoc token lookahead.
