# Tuff Compiler

A self-hosted compiler for a new systems programming language with syntax inspired by Rust, TypeScript, and Kotlin.

## Vision

The Tuff language aspires to combine the safety and performance of Rust, the expressiveness and tooling of TypeScript, and the pragmatism of Kotlin. This compiler is implemented using a **multi-stage bootstrap strategy** to enable gradual self-hosting while maintaining stability.

## Architecture: Stage 0 → Stage 1 Transition

### Stage 0: TypeScript Bootstrap (Current)

The compiler is written in **TypeScript** and targets **TypeScript** as an intermediate compilation format. This allows us to:

- Develop the compiler safely with full type checking
- Test each pipeline phase independently
- Emit TypeScript that can be run immediately with any JavaScript runtime (Bun, Node.js, Deno)
- Gradually migrate compiler components to Tuff itself

**Pipeline:**
```
Tuff Source (.tuff)
    ↓
[Lexer] → Tokens
    ↓
[Parser] → AST
    ↓
[Analyzer] → Type-checked AST + Symbol Table
    ↓
[Codegen] → TypeScript Code
    ↓
TypeScript Output (.ts)
```

### Stage 1: Self-Hosting (Future)

Once the compiler is stable and feature-complete in TypeScript, we'll selectively rewrite compiler components in Tuff itself. This approach is much safer than trying to bootstrap directly because:

- We can rewrite one component at a time while keeping others in TypeScript
- We can test each component thoroughly before moving to the next
- We have a working reference implementation in TypeScript
- Performance can be incrementally improved

## Project Structure

```
Tuff/
├── src/
│   ├── lexer/          # Tokenization (source → tokens)
│   ├── parser/         # Syntax analysis (tokens → AST)
│   ├── ast/            # AST node definitions and utilities
│   ├── analyzer/       # Semantic analysis (AST → typed AST + symbol table)
│   ├── codegen/        # Code generation (AST → TypeScript)
│   ├── compiler/       # Pipeline orchestration
│   ├── cli/            # Command-line interface
│   └── index.ts        # Public API exports
├── tests/
│   ├── fixtures/       # Example .tuff programs
│   ├── test-utils.ts   # Testing helpers
│   └── *.test.ts       # Phase-specific tests
├── docs/               # Documentation
│   ├── LANGUAGE.md     # Language syntax reference
│   ├── compiler-architecture.md
│   └── bootstrap-plan.md
├── examples/           # Example programs
└── package.json        # npm/Bun configuration
```

## Getting Started

### Prerequisites

- Bun (latest) or Node.js 18+
- TypeScript 5.3+

### Installation

```bash
cd Tuff
bun install
```

### Development

```bash
# Type checking
bun run typecheck

# Run tests
bun test
bun test --watch

# Development server (rebuilds on changes)
bun run dev

# Format code
bun run format

# Lint code
bun run lint

# Build compiler
bun run build
```

### Using the compiler

```bash
# Compile a Tuff file
bun dist/cli/index.js build examples/hello.tuff

# Type-check without compilation
bun dist/cli/index.js check examples/hello.tuff
```

## Language Features (Planned)

### Syntax

Tuff borrows syntax from three languages:

**From Rust:**
- Ownership and borrowing (eventual)
- Pattern matching with `match` expressions
- `fn` keyword for functions
- `struct` and `enum` definitions
- Trait system

**From TypeScript:**
- Optional types and `?` operator
- Union types with `|`
- Type aliases with `type`
- Generic types with `<T>`
- Interface-like traits

**From Kotlin:**
- Pragmatic null safety (not as strict as Rust)
- Extension functions (planned)
- `when` expressions (via `match`)
- Mutable/immutable binding distinction

### Example (Not yet compilable)

```tuff
// Variables
let x: i32 = 42
let mut y: i32 = 0

// Functions
fn add(a: i32, b: i32) -> i32 {
  a + b
}

// Structs
struct Point {
  x: f64
  y: f64
}

// Pattern matching
fn describe(value: i32) -> string {
  match value {
    0 => "zero",
    1..10 => "small",
    _ => "large",
  }
}

// Generic functions
fn first<T>(items: T[]) -> T? {
  items[0]
}
```

## Compiler Phases

### 1. Lexer

Converts source text into a stream of tokens. Handles:
- Identifier and keyword recognition
- Number and string literals
- Operators and delimiters
- Position tracking for error reporting

**Output**: Vector of `Token` with type, value, and location

### 2. Parser

Builds an Abstract Syntax Tree (AST) from tokens via recursive descent parsing. Enforces:
- Operator precedence
- Expression vs statement distinction
- Declaration syntax

**Output**: `Program` containing all top-level statements

### 3. Analyzer

Performs semantic analysis and type checking:
- Symbol table construction
- Type inference and checking
- Access control (public/private)
- Dead code detection
- Mutability checking

**Output**: Type-annotated AST + symbol table

### 4. Codegen

Emits TypeScript code from the analyzed AST:
- Converts Tuff constructs to TypeScript equivalents
- Preserves type annotations
- Includes source maps for debugging

**Output**: TypeScript file ready for execution

## Contributing

Contributions are welcome! See the [bootstrap plan](./docs/bootstrap-plan.md) for information on architecture and next steps.

## License

MIT

## References

- [Rust Book](https://doc.rust-lang.org/book/) - Ownership and type system inspiration
- [TypeScript Handbook](https://www.typescriptlang.org/) - Type system and tooling
- [Kotlin Language Guide](https://kotlinlang.org/docs/home.html) - Pragmatism and syntax
- [Crafting Interpreters](https://craftinginterpreters.com/) - Compiler architecture patterns
