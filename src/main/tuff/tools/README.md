# Tuff Tools

This directory contains utility and code-generation tools for the Tuff compiler and ecosystem.

## EBNF Grammar System

A bidirectional grammar framework for defining Tuff syntax and automatically generating parsers and AST-producing code.

### Modules

| Module                      | Purpose                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`ebnf_parser.tuff`**      | Parses EBNF grammar files into an internal representation. Handles terminal/non-terminal rules, alternation, repetition, grouping.                                                   |
| **`ebnf_validator.tuff`**   | Validates EBNF grammars for well-formedness: undefined rule references, circular dependencies, ambiguity detection.                                                                  |
| **`ebnf_codegen.tuff`**     | General-purpose code generation from EBNF (TBD: template-driven output).                                                                                                             |
| **`ebnf_codegen_ast.tuff`** | **Generates AST-producing parsers from EBNF grammars**. Emits Tuff or JavaScript code that parses input and directly constructs AST nodes, avoiding hand-written parser boilerplate. |

### Workflow

```
Grammar File (EBNF)
  ↓
ebnf_parser.tuff (parse grammar)
  ↓ [Grammar AST]
ebnf_validator.tuff (validate rules, detect errors)
  ↓ [Validated Grammar]
ebnf_codegen_ast.tuff (generate parser code)
  ↓
Generated Parser (Tuff or JS)
  ↓ [Parses input + builds AST]
```

### Use Cases

1. **Reduce parser boilerplate** — Instead of hand-writing recursive descent parsers, define grammar once and generate code
2. **Maintain grammar-code sync** — Grammar is single source of truth
3. **Enable parser experimentation** — Quick iteration on syntax via EBNF → code pipeline
4. **Support multiple output formats** — Generate Tuff, JavaScript, or other targets from same grammar

### Example

Grammar file (`expr.ebnf`):

```ebnf
expr := term (('+' | '-') term)*;
term := factor (('*' | '/') factor)*;
factor := '(' expr ')' | NUMBER;
```

Generated parser (conceptual):

```tuff
fn parse_expr(tokens: &mut TokenStream) : Expr {
  let left = parse_term(tokens);
  while tokens.peek() == '+' || tokens.peek() == '-' {
    let op = if tokens.peek() == '+' { OpAdd } else { OpSub };
    tokens.advance();
    let right = parse_term(tokens);
    left = Expr::Binary { op, left, right };
  }
  left
}
```

## Future Tools

This directory will expand to include:

- **Refactoring utilities** — AST-level code transformations, automated fixes
- **Code generation framework** — Templated code generation for other Tuff projects
- **Language server utilities** — Shared LSP helpers (hover, completion, definition lookup)
- **Performance analysis** — Compiler timing, AST size analysis
