# Plan: Tuff Self-Hosted Compiler — Full Specification & Bootstrap Implementation

Tuff is a statically-typed language blending Rust ownership semantics, Kotlin pragmatism, TypeScript type inference, and theorem prover formalism. The Rust bootstrap compiler targets C, featuring a lexical borrow checker, `extern` FFI, Rust-style pattern matching, and discriminated unions. Compiler errors include filename, line number, message, and recommended fix. After bootstrap maturity, the compiler will be ported to Tuff for self-hosting.

## Steps

1. **Formalize language specification document** — Write EBNF grammar for all syntax (expressions, statements, types, ownership, extern, unions, patterns); document type inference algorithm, lexical scoping rules, borrow checker semantics, and C code generation mappings; include 10+ annotated code examples.

2. **Design detailed error reporting system** — Define error struct with filename, line/column spans, error message, and recommended fix fields; plan error categories (syntax, type, borrow, name resolution); design error presentation format.

3. **Initialize Rust bootstrap project** — Create Cargo workspace at repository root with `compiler` binary, `stdlib` library, `tests` directory; add dependencies (likely just `std` for now); structure modules: `lexer`, `parser`, `ast`, `types`, `type_checker`, `borrow_checker`, `codegen`, `error`.

4. **Implement lexer with span tracking** — Tokenize Tuff syntax; track filename, line, and column for all tokens; support keywords (`fn`, `let`, `mut`, `&`, `type`, `match`, `extern`, etc.), operators, literals, identifiers; emit errors for invalid tokens.

5. **Implement recursive-descent parser** — Parse items (functions, type definitions, extern blocks); parse expressions (literals, variables, operators, function calls, field access); parse statements (let bindings, assignments, if/match/loops, returns); handle ownership annotations; build AST with span information.

6. **Implement type checker with inference** — Infer expression types; validate type consistency across assignments and function calls; generate constraint equations; solve for type variables; emit detailed type errors with recommendations (e.g., "expected `i32`, found `&str`; try dereferencing with `*x`").

7. **Implement lexical borrow checker** — Track variable lifetimes (function-scoped); validate ownership rules (no multiple mutable borrows, references valid within scope); emit borrow errors with recommendations (e.g., "cannot borrow `x` as mutable twice; consider restructuring").

8. **Implement C code generator** — Translate Tuff function definitions to C; emit type definitions for structs and union types; generate extern function declarations; map ownership to pointer/stack decisions; output compilable C code.

9. **Build minimal standard library** — Implement `println!` for I/O, basic string/memory types in Tuff; compile with bootstrap to validate full pipeline; keep stdlib small initially (expand post-bootstrap).

10. **Develop multi-phase test suite** — Unit tests per compiler phase; integration tests (Tuff → C → compile → run); property tests for type correctness; prepare test infrastructure for differential testing during self-hosting phase.

11. **Port compiler to Tuff incrementally** — Rewrite lexer in Tuff, validate against Rust version; proceed to parser, type checker, borrow checker, codegen; compile each component with bootstrap, test output equivalence.

12. **Achieve and validate self-hosting** — Bootstrap compiler compiles Tuff compiler; generated C compiles itself; run triple-check test (compile → compile output → compile again, verify outputs match).

## Further Considerations

1. **Language design clarity** — Need formal definitions for: (a) When does a borrow end in lexical scope? (b) Can function parameters consume ownership, or only borrow? (c) How does `mut` interact with `&mut`? Recommend documenting edge cases early.

2. **Standard library I/O strategy** — Should `println!` map directly to C `printf`, or build abstraction layer? Recommend direct C interop initially for simplicity.

3. **Parser error recovery** — Should parser panic on first error or attempt recovery and report multiple? Recommend single-error-stop initially (simpler), add recovery later.

4. **Codegen validation** — How to ensure generated C is correct? Recommend: (a) human review of early codegen, (b) compile generated C with `-Wall -Werror`, (c) fuzz-test with property-based tests.

5. **Bootstrap compiler feature gates** — Should bootstrap support full Tuff spec, or minimal subset? Recommend: bootstrap supports enough for stdlib + compiler, expand later.

## Decision Summary

- **Memory model**: Ownership and borrowing (Rust-style), lexical lifetimes only (no NLL)
- **Reference types**: Rc type to be introduced in stdlib later; no built-in reference counting yet
- **FFI**: `extern "C"` blocks; assume programmer handles safety
- **Union types**: Discriminated unions with syntax `type Option<T> = Some<T> | None<T>;`
- **Pattern matching**: Rust-style `match` expressions
- **Error reporting**: Filename, line number, error message, recommended fix
- **Optimization**: Defer to C compiler
- **Bootstrap language**: Rust
- **Compilation target**: C
- **Self-hosting validation**: Triple-check test (compile output compiles itself, outputs match)

## Next Steps

Start with:
- **Step 1**: Create language specification document (EBNF + semantics)
- **Step 3**: Set up Rust project structure
- **Step 4–5**: Implement lexer and parser (first working pieces)