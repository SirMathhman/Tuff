# Compiler Architecture

This document describes the internal architecture of the Tuff compiler and how data flows through each phase.

## High-Level Pipeline

```
Source Code (.tuff)
    ↓
┌───────────────────────────────────────────────────────┐
│ LEXER: Tokenization                                   │
│ Input: String                                         │
│ Output: Token[]                                       │
└───────────────────────────────────────────────────────┘
    ↓
┌───────────────────────────────────────────────────────┐
│ PARSER: Syntax Analysis                               │
│ Input: Token[]                                        │
│ Output: Program (AST)                                 │
└───────────────────────────────────────────────────────┘
    ↓
┌───────────────────────────────────────────────────────┐
│ ANALYZER: Semantic Analysis & Type Checking           │
│ Input: Program (AST)                                  │
│ Output: Program + SymbolTable + TypeMap               │
└───────────────────────────────────────────────────────┘
    ↓
┌───────────────────────────────────────────────────────┐
│ CODEGEN: TypeScript Emission                          │
│ Input: Program + Analysis Results                     │
│ Output: TypeScript Code                               │
└───────────────────────────────────────────────────────┘
    ↓
TypeScript Output (.ts)
```

## Phase 1: Lexer

**File**: `src/lexer/types.ts` (types), `src/lexer/index.ts` (implementation)

### Responsibilities

- Read source text character-by-character
- Recognize tokens: identifiers, keywords, operators, literals, delimiters
- Track position information (line, column, offset) for error reporting
- Handle comments (single-line `//` and multi-line `/* */`)
- Report lexical errors (invalid characters, unterminated strings, etc.)

### Input

```
let x: i32 = 42;
```

### Output

```
Token[] {
  { type: TokenType.Let, value: "let", location: { start: {0,0}, end: {0,3} } },
  { type: TokenType.Identifier, value: "x", location: { start: {0,4}, end: {0,5} } },
  { type: TokenType.Colon, value: ":", location: { start: {0,5}, end: {0,6} } },
  { type: TokenType.Identifier, value: "i32", location: { start: {0,7}, end: {0,10} } },
  { type: TokenType.Eq, value: "=", location: { start: {0,11}, end: {0,12} } },
  { type: TokenType.IntLiteral, value: "42", location: { start: {0,13}, end: {0,15} } },
  { type: TokenType.Semicolon, value: ";", location: { start: {0,15}, end: {0,16} } },
  { type: TokenType.EOF, value: "", location: { ... } },
}
```

### Key Data Structures

- **Token**: Represents a single lexical unit with type, value, and source location
- **Position**: (line, column, offset) for precise error reporting
- **SourceLocation**: Range from start to end position

### Error Handling

Lexer errors include:
- Invalid character sequences
- Unterminated strings or comments
- Malformed numbers

Errors are collected and returned in `LexerOutput.errors` to enable multipass error reporting.

## Phase 2: Parser

**File**: `src/parser/index.ts` (types + implementation)

### Responsibilities

- Convert token stream into Abstract Syntax Tree (AST)
- Enforce grammar and syntax rules
- Respect operator precedence
- Handle declarations: functions, structs, enums, traits, type aliases
- Build expression trees respecting precedence
- Report syntax errors with helpful hints

### Input

```
Token[] with Let, Identifier, Colon, Identifier, Eq, IntLiteral, Semicolon, EOF
```

### Output

```
Program {
  statements: [
    VariableDeclaration {
      name: "x",
      type: ReferenceType { name: "i32" },
      initializer: NumberLiteral { value: 42, isFloat: false },
      isMutable: false,
    }
  ]
}
```

### Grammar Structure

High-level grammar (simplified):

```
program → statement* EOF

statement → var_decl
          | fn_decl
          | struct_decl
          | enum_decl
          | impl_block
          | expr_stmt
          | return_stmt

var_decl → 'let' 'mut'? identifier ':' type '=' expr ';'

fn_decl → 'fn' identifier '(' params ')' '->' type? block

expr → assignment
assignment → logical_or ('=' assignment)?
logical_or → logical_and ('||' logical_and)*
logical_and → equality ('&&' equality)*
equality → comparison (('==' | '!=') comparison)*
comparison → additive (('<' | '<=' | '>' | '>=') additive)*
additive → multiplicative (('+' | '-') multiplicative)*
multiplicative → unary (('*' | '/' | '%') unary)*
unary → ('!' | '-') unary | postfix
postfix → primary ('[' expr ']' | '.' identifier | '(' args ')')*
primary → literal | identifier | '(' expr ')'
```

### AST Node Types

All inherit from `ASTNode`:

- **Declarations**: FunctionDeclaration, VariableDeclaration, StructDeclaration, EnumDeclaration, TraitDeclaration, TypeAlias
- **Expressions**: Identifier, Literal, BinaryOp, UnaryOp, CallExpression, MemberAccess, IndexAccess, ControlFlow
- **Statements**: ExpressionStatement, ReturnStatement, BreakStatement, ContinueStatement

### Error Recovery

The parser attempts to recover from errors to report multiple issues in a single pass:
- Skip to next statement boundary on syntax error
- Provide suggestions (expected token hints)
- Track error locations for IDE integration

## Phase 3: Analyzer

**File**: `src/analyzer/index.ts` (types + implementation)

### Responsibilities

- Build symbol table (scoped name resolution)
- Perform type checking and inference
- Detect duplicate definitions and undefined references
- Check access control (public/private)
- Detect unreachable code
- Validate mutability constraints
- Collect all type information for codegen

### Input

```
Program (AST from parser)
```

### Output

```
AnalyzerOutput {
  ast: Program,                    // Same AST, potentially annotated
  symbolTable: SymbolTable,        // Scoped name → Symbol mappings
  typeMap: Map<string, TypeInfo>,  // ID → Type mappings for all expressions
  errors: AnalysisError[],         // Semantic errors
}
```

### Symbol Table

Maintains a stack of scopes (global → block-level):

```typescript
class SymbolTable {
  private scopes: Map<string, Symbol>[]  // Stack of scope maps

  pushScope()     // Enter new scope
  popScope()      // Exit scope
  define(symbol)  // Add symbol to current scope
  lookup(name)    // Search scopes from innermost to global
}
```

### Type Checking

- **Function arguments**: Must match declared parameter types
- **Variable assignments**: Assigned value must match declared type
- **Binary operations**: Both operands must be compatible
- **Generic instantiation**: Type arguments must satisfy bounds
- **Null safety**: Null can only be assigned to nullable types
- **No-panic guarantee**: Enforced through compile-time checks that prevent runtime errors

### Enforcing the No-Panic Guarantee

Tuff code is **guaranteed to never panic at runtime**. This is enforced through analyzer checks:

1. **Null Checking**: Dereferences and method calls on nullable types (`T?`) are flagged as errors. All potential null values must be explicitly handled with `if` checks or matches.

2. **Array Bounds**: Array indexing is checked at compile-time where possible. Out-of-bounds accesses in unknown dimensions are wrapped with runtime bounds checks in generated code.

3. **Type Safety**: All type mismatches are caught at compile-time. No invalid casts, invalid enum variants, or incorrect field accesses reach runtime.

4. **Exhaustive Matching**: `match` expressions must be exhaustive (cover all cases) to ensure no paths lead to undefined behavior.

5. **Arithmetic Safety**: Integer overflow/underflow is handled via wrapping semantics or explicit checked operations, never causing panics.

6. **Error Propagation**: Functions that can fail return `Result<T>` or `T?` types, forcing callers to handle errors explicitly.

These checks are performed during the **Analyzer phase**, so any code that compiles is guaranteed crash-free at runtime.

### Error Codes

```typescript
enum ErrorCode {
  UndefinedSymbol,      // Use of undefined variable/function
  DuplicateDefinition,  // Redeclaration in same scope
  TypeMismatch,         // Assignment or argument type mismatch
  InvalidOperation,     // Unsupported operation for type
  UnreachableCode,      // Dead code after return/break
  BorrowError,          // (Future) Invalid borrowing
  MutabilityError,      // Mutation of immutable binding
  AccessError,          // Access to private member
}
```

### Scope Rules

Variables shadow outer scopes. Structs, functions, traits are global (not block-scoped).

```tuff
let x = 1     // Global scope
{
  let x = 2   // Shadows outer x within block
  println(x)  // Prints 2
}
println(x)    // Prints 1
```

## Phase 4: Codegen

**File**: `src/codegen/index.ts` (types), `src/codegen/` (implementation)

### Responsibilities

- Convert type-checked AST into TypeScript
- Maintain source maps for debugging
- Emit declarations for public API
- Optimize for readability (Stage 0) or size (with --minify)
- Handle Tuff → TypeScript type mappings

### Input

```
AnalyzerOutput {
  ast: Program,
  symbolTable: SymbolTable,
  typeMap: Map,
  errors: [],
}
```

### Output

```typescript
// Generated file.ts
export function add(a: number, b: number): number {
  return a + b
}

export interface Point {
  x: number
  y: number
}
```

### Type Mapping

Tuff types map to TypeScript:

| Tuff Type | TypeScript |
|-----------|-----------|
| `i32`, `i64`, `u32`, `u64`, `f32`, `f64` | `number` |
| `bool` | `boolean` |
| `*Str` | `string` (borrowed) |
| `String` | `string` (owned) |
| `T[]` | `T[]` |
| `T?` (nullable) | `T \| undefined` |
| `T \| U` (union) | `T \| U` |
| `struct { ... }` | `interface { ... }` |
| `enum { ... }` | TypeScript enum or tagged union |
| `fn(T) -> U` | `(arg: T) => U` |

### Emission Context

`EmissionContext` manages indentation and output buffering:

```typescript
class EmissionContext {
  write(text)        // Append text
  writeLine(text)    // Append text with indentation + newline
  increaseIndent()
  decreaseIndent()
  getOutput() -> string
}
```

### Source Maps

Optional source maps preserve location information from Tuff source in TypeScript:

```json
{
  "version": 3,
  "sources": ["main.tuff"],
  "names": [],
  "mappings": "..."
}
```

## Compiler Orchestration

**File**: `src/compiler/index.ts`

The `Compiler` interface orchestrates all phases:

```typescript
interface Compiler {
  compile(source, options?): CompileOutput
  lex(source): LexerOutput
  parse(tokens): ParserOutput
  analyze(ast): AnalyzerOutput
  generate(ast, analysis, options?): CodegenOutput
}
```

### Compilation Options

```typescript
interface CompilerOptions {
  continueOnError?: boolean  // Report all errors vs. fail fast
  target?: "typescript" | "javascript"
  sourceMap?: boolean
  minify?: boolean
  moduleName?: string
}
```

### Error Collection

Errors from all phases are collected and reported:

```typescript
interface CompileOutput {
  success: boolean
  lexing: LexerOutput
  parsing: ParserOutput
  analysis?: AnalyzerOutput
  codegen?: CodegenOutput
  allErrors: Array<{ phase, errors }>
}
```

## Error Reporting Strategy

Tuff tries to report **all errors in a single pass** rather than failing fast:

1. **Lexer**: Collects all token errors
2. **Parser**: Recovers from syntax errors and continues parsing
3. **Analyzer**: Reports all semantic errors (undefined symbols, type mismatches, etc.)
4. **Codegen**: Only runs if no errors in earlier phases

This enables better IDE support and faster error feedback loops.

## Testing Strategy

Each phase is tested independently:

- **Lexer tests**: Verify tokens match expected output
- **Parser tests**: Verify AST structure matches grammar
- **Analyzer tests**: Verify symbol resolution and type checking
- **Codegen tests**: Verify TypeScript output is valid

Integration tests verify the entire pipeline works end-to-end.
