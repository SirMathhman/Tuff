# Plan: EBNF-to-Parser/Printer Generator

Parse EBNF grammar files and generate both parser and pretty-printer automatically.

## Overview

**Workflow:**

```
tuff.ebnf (grammar specification)
    ↓
EBNF Parser (parse grammar file)
    ↓
Grammar AST (internal representation)
    ↓
Code Generator
    ↓
├─ parser.tuff (text → AST)
└─ printer.tuff (AST → text)
```

## EBNF Notation for Tuff

**Example Grammar Specification:**

```ebnf
(* tuff.ebnf - Tuff language grammar *)

(* Literals *)
integer ::= [0-9]+ ;
float ::= [0-9]+ "." [0-9]+ ("F32" | "F64")? ;
boolean ::= "true" | "false" ;
string ::= '"' [^"]* '"' ;

(* Operators *)
bin_op ::= "+" | "-" | "*" | "/" | "==" | "!=" | "<" | ">" ;
un_op ::= "!" | "-" ;

(* Expressions *)
expr ::=
  | integer
  | float
  | boolean
  | string
  | ident
  | expr bin_op expr       (* binary operation *)
  | un_op expr             (* unary operation *)
  | expr "(" expr_list ")" (* function call *)
  | "if" expr expr "else" expr
  | "{" stmt* expr "}"     (* block *)
  | expr "is" ident        (* type check *)
  ;

expr_list ::= (expr ("," expr)*)? ;

(* Statements *)
stmt ::=
  | "let" "mut"? ident (":" type)? "=" expr ";"
  | ident "=" expr ";"
  | "yield" expr ";"
  | expr ";"
  ;

(* Declarations *)
decl ::=
  | "fn" ident "(" param_list ")" (":" type)? "=>" expr
  | "struct" ident "{" field_list "}"
  | "type" ident "=" variant ("|" variant)* ";"
  ;

param_list ::= (param ("," param)*)? ;
param ::= ident ":" type ;

field_list ::= (ident ("," ident)*)? ;
variant ::= ident ("<" type_list ">")? ;
```

**With Formatting Annotations:**

```ebnf
(* Formatting directives *)
expr ::=
  | expr @space bin_op @space expr  (* spaces around operators *)
  | un_op @noSpace expr              (* no space after unary *)
  ;

decl ::=
  | "fn" @space ident "(" @noBreak param_list ")" @break
    (":" @space type)? @space "=>" @break
    @indent(expr)
  ;
```

## Implementation Phases

### Phase 1: EBNF Parser (Start Here)

**Goal**: Parse EBNF files into grammar AST

**EBNF Meta-Grammar:**

```ebnf
(* Grammar for parsing EBNF itself *)
grammar ::= rule+ ;

rule ::= ident "::=" production ";" ;

production ::=
  | sequence ("|" sequence)*  (* alternation *)
  ;

sequence ::= term+ ;

term ::=
  | ident                      (* non-terminal *)
  | string                     (* literal *)
  | "[" char_range "]"         (* character class *)
  | term "*"                   (* zero or more *)
  | term "+"                   (* one or more *)
  | term "?"                   (* optional *)
  | "(" production ")"         (* grouping *)
  | "@" ident "(" term ")"     (* annotation *)
  ;

char_range ::= char "-" char | char ;
```

**Module:** `tools/ebnf_parser.tuff`
**Complexity:** ~300 lines

### Phase 2: Grammar Validation

**Goal**: Check grammar is well-formed

**Checks:**

- All non-terminals are defined
- No left recursion (or detect and handle)
- No ambiguities (or warn)
- Precedence annotations are consistent

**Module:** `tools/ebnf_validator.tuff`
**Complexity:** ~200 lines

### Phase 3: Parser Generator

**Goal**: Generate recursive descent parser from grammar

**Module:** `tools/ebnf_codegen_parser.tuff`
**Complexity:** ~400 lines

### Phase 4: Printer Generator

**Goal**: Generate pretty-printer from grammar

**Module:** `tools/ebnf_codegen_printer.tuff`
**Complexity:** ~400 lines

### Phase 5: Precedence & Associativity

**Goal**: Handle operator precedence in grammar

**Extended EBNF Syntax:**

```ebnf
expr ::=
  | expr @prec(10) "*" expr @assoc(left)
  | expr @prec(9) "+" expr @assoc(left)
  | "-" @prec(15) expr @assoc(right)  (* unary *)
  ;
```

**Complexity:** ~200 lines

### Phase 6: AST Mapping

**Goal**: Map EBNF rules to existing AST types

**Annotation Syntax:**

```ebnf
(* Map to existing AST *)
expr ::=
  | integer @map(EInt)
  | expr @space "+" @space expr @map(EBinary(OpAdd, $1, $3))
  ;
```

**Complexity:** ~150 lines

### Phase 7: Formatting Directives

**Goal**: Control pretty-printing layout

**Directives:**

- `@space` - single space
- `@break` - newline + indent
- `@softbreak` - break if line exceeds width
- `@indent(x)` - increase indent for x
- `@align(x)` - align continuation to current column
- `@group(x)` - try to fit x on one line, else break all

**Complexity:** ~200 lines

### Phase 8: Integration

**Goal**: Use generated parser/printer in compiler

**Build Process:**

```bash
# Generate parser and printer from grammar
tuff codegen tuff.ebnf --output src/main/tuff/compiler/generated/
```

**Complexity:** ~100 lines

## Bootstrapping Strategy

**Stage 1**: Handwrite minimal EBNF parser in Tuff (~500 lines)

**Stage 2**: Write EBNF grammar for EBNF itself

```ebnf
(* ebnf.ebnf - meta-grammar *)
grammar ::= rule+ ;
rule ::= ident "::=" production ";" ;
```

**Stage 3**: Generate EBNF parser from its own grammar (self-hosting)

**Stage 4**: Write full Tuff grammar in EBNF

**Stage 5**: Generate Tuff parser/printer, replace existing parser

## Timeline

| Phase                | Effort    | Deliverable                    |
| -------------------- | --------- | ------------------------------ |
| Phase 1: EBNF Parser | 1 week    | Parse EBNF files               |
| Phase 2: Validation  | 3 days    | Check grammar well-formedness  |
| Phase 3: Parser Gen  | 1.5 weeks | Generate parsers from grammar  |
| Phase 4: Printer Gen | 1.5 weeks | Generate printers from grammar |
| Phase 5: Precedence  | 1 week    | Operator precedence handling   |
| Phase 6: AST Mapping | 3 days    | Map grammar to existing AST    |
| Phase 7: Formatting  | 1 week    | Layout directives              |
| Phase 8: Integration | 1 week    | Build system integration       |

**Total: ~8 weeks**

## Advantages

| Aspect                | Manual Code                  | EBNF Generator                            |
| --------------------- | ---------------------------- | ----------------------------------------- |
| Grammar Specification | Implicit in code             | Explicit, documented                      |
| Maintenance           | Update multiple functions    | Update grammar once                       |
| Correctness           | Manual verification          | Generated code is correct by construction |
| Extensibility         | Add parsing logic everywhere | Add one grammar rule                      |
| Documentation         | Code comments                | Grammar IS the documentation              |
