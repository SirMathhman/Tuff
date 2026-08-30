# Project Guidelines

`tuffc` is a Rust compiler/interpreter for the **Tuff** language — currently an
arithmetic expression evaluator with `let`/`mut` bindings, assignment, the
`true` literal (evaluates to `1`), and reference (`&` / `&mut`) / dereference
(`*`) operators, including deref-assignment (`*y = 1;`).

## Canonical Architecture

The grammar and design live in the architecture doc at
`/memories/repo/architecture.md` (repo memory). It describes where the project
is _going_, not what exists today — keep it ahead of the code. Treat it as the
single source of truth for the grammar.

## Build & Test

- `cargo test` — run the suite (tests live in `src/lib.rs`, `mod tests`).
- `cargo build` — build the `tuffc` binary.
- Run an expression: `cargo run -- "2 + 3 * 4"`.

## Workflow (test-first)

Standard loop: add a failing test in `src/lib.rs` `mod tests` of the form
`evaluate("<tuff source>") => <expected>`, then implement until it passes.
Empty input is defined to evaluate to `0`.

## Stage Responsibilities (strict)

- **Lexer** (`lexer.rs`): pure char→token map. Never inspects the previous
  token; every `-` is `Token::Minus`. Rejects only lexically invalid input.
- **Parser** (`parser.rs`): owns _all_ syntactic decisions (ordering, balanced
  delimiters, unary vs. binary, precedence). Recursive descent, two precedence
  levels.
- **Backend** (`eval.rs`): pure function of the AST.

Dependency direction is strictly one-way: `main → lib → { eval → parser → lexer }`,
with `ast`, `span`, `errors` as shared leaves. No module depends on `main`.

## Invariants (easy to violate)

- **No `panic!`/`unwrap` on user-facing paths.** All fallible ops return
  `Result<_, Error>`. A diagnostic must answer what / where / why / how-to-fix;
  a zero-span (`Span { 0, 0 }`) diagnostic fails "where".
- **Every AST node carries a `Span`.** Never fabricate one — the node that
  caused the error must carry its own.
- **Keep `errors.rs` `Display` in sync with the grammar.** When a token or
  production is added, update the "expected …" text so messages never omit a
  valid alternative. `test_unexpected_token_message_lists_unary_operators` is a
  regression guard for this.
- **`main.rs` stays trivial** (arg parsing, I/O, exit codes). Any logic belongs
  in `lib.rs`.
- **Size limits**: ≤ 50 lines/function, ≤ 300 lines/file, ≤ 10 files/directory.

## Semantics gotchas

- `&` / `&mut` capture a variable _name_ at the reference site; `*` resolves
  that name in the current environment at the `*` site. A `Ref`/`RefMut` as the
  final result is an error.
- Deref-assignment (`*y = expr;`) writes through the reference; the referent
  must be a `let mut` binding (else `ImmutableVariable`).
- `let`/`mut`/`true` are reserved keywords (dedicated `Token::Let`/`Token::Mut`/
  `Token::True`), not valid identifiers. `true` desugars to the integer `1` at
  parse time.
- Assigning to a non-`mut` binding is an `ImmutableVariable` error.
