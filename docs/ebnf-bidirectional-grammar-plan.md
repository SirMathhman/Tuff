# EBNF-to-Parser/Printer Generator Implementation

Parse EBNF grammar files and generate both parser and pretty-printer automatically.

## Current Status (as of December 2025)

**Overall Progress: 50% Complete (~4 weeks of work done)**

### ✅ Completed Phases

- **Phase 1: EBNF Parser** ✅ COMPLETE (~580 lines)

  - Parse EBNF grammar files into AST
  - Support for all EBNF constructs: alternation, sequence, repetition, character classes, annotations
  - Pretty-printer for debugging grammar structures
  - Fully tested and working

- **Phase 2: Grammar Validation** ✅ COMPLETE (~270 lines)

  - Check for undefined non-terminals
  - Detect duplicate rule names
  - Validate grammar structure
  - Tested

- **Phase 3: Parser Generator** ✅ PARTIAL (~640 lines)

  - Generate recursive descent parser code from EBNF
  - Handles alternation, sequence, repetition, character classes
  - Generates CST (Concrete Syntax Tree) node types
  - Produces executable parser Tuff code
  - **Gap**: No operator precedence handling yet

- **Phase 4: Emitter Generator** ✅ PARTIAL

  - Generate pretty-printer code from EBNF
  - Support for formatting annotations (`@space`, `@break`, `@indent`)
  - Handles indentation and context
  - Integrated with codegen module

- **Additional Work** ✅ COMPLETE
  - Created formal Tuff EBNF grammar (`grammars/tuff.ebnf`)
  - Created JavaScript EBNF grammar (`grammars/javascript.ebnf`)
  - Built Tuff-to-JS transpiler foundation
  - Added operator factory functions to AST

### 🚧 Critical Blockers

1. **Union Variants Across Modules** 🔴 BLOCKER

   - Union variants (EInt, EBool, etc.) cause infinite loops when imported cross-module
   - Affects: all testing, transpiler, external AST usage
   - **Impact**: Tests crash with out-of-memory errors
   - **Estimated effort**: 2-3 days debugging

2. **Operator Precedence** 🔴 CRITICAL
   - Generated parsers don't handle precedence/associativity
   - Can't parse real expressions correctly (e.g., `a + b * c` misparsed)
   - **Impact**: Generated parser produces wrong AST for expressions
   - **Estimated effort**: 1 week implementation

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

### Phase 1: EBNF Parser ✅ COMPLETE

**Goal**: Parse EBNF files into grammar AST

**Status**: Complete - Parse EBNF files successfully

**Module:** `tools/ebnf_parser.tuff`
**Lines of Code**: ~580 lines
**Tests**: All passing

### Phase 2: Grammar Validation ✅ COMPLETE

**Goal**: Check grammar is well-formed

**Checks:**

- All non-terminals are defined ✅
- Duplicate rule names detected ✅
- Grammar structure validation ✅
- No left recursion detection ✓ (planned)

**Module:** `tools/ebnf_validator.tuff`
**Lines of Code**: ~270 lines
**Status**: Core validation working

### Phase 3: Parser Generator ✅ PARTIAL

**Goal**: Generate recursive descent parser from grammar

**Status**: Core parser generation working, but **lacks operator precedence**

**What Works:**

- Generates parser for non-recursive rules ✅
- Handles alternation, sequence, repetition ✅
- Generates CST node types ✅
- Produces executable Tuff code ✅

**What's Missing:**

- Operator precedence handling ❌ (BLOCKER for Phase 5)
- Associativity directives ❌
- Error recovery ❌ (acceptable for MVP)

**Module:** `tools/ebnf_codegen_parser.tuff`
**Lines of Code**: ~640 lines
**Status**: Ready for precedence implementation

### Phase 4: Printer Generator ✅ PARTIAL

**Goal**: Generate pretty-printer from grammar

**Status**: Core functionality implemented with formatting directives

**What Works:**

- Generates printer from grammar rules ✅
- Supports `@space`, `@break`, `@indent` annotations ✅
- Handles indentation context ✅

**What's Missing:**

- Layout algebra (Wadler's system) ❌ (Phase 7)
- Automatic line wrapping ❌ (Phase 7)
- Advanced formatting ❌ (Phase 7)

**Module:** `tools/ebnf_codegen_printer.tuff`
**Status**: Foundation ready for Phase 7

### Phase 5: Precedence & Associativity 🚧 NEXT

**Goal**: Handle operator precedence in grammar

**Status**: NOT STARTED - **CRITICAL for Phase 3 completion**

**Requirements:**

- Implement precedence climbing algorithm in parser generator
- Support infix, prefix, and postfix operators
- Handle left/right/non-associativity
- Validate precedence levels are consistent

**Extended EBNF Syntax:**

```ebnf
expr ::=
  | expr @prec(10) @assoc(left) "*" expr
  | expr @prec(9) @assoc(left) "+" expr
  | @prec(15) @assoc(right) "-" expr  (* unary *)
  ;
```

**Implementation Plan:**

1. Add precedence annotations to grammar AST
2. Extract operator table from grammar rules
3. Generate precedence climbing parser
4. Validate no precedence conflicts

**Module:** Enhancement to `tools/ebnf_codegen_parser.tuff`
**Estimated Lines**: ~150-200 lines
**Effort**: 1 week
**Blockers**: None - can start immediately

### Phase 6: AST Mapping 🚧 AFTER PHASE 5

**Goal**: Map EBNF rules to existing AST types (not just CST)

**Status**: NOT STARTED - **Depends on Phase 5 completion**

**Current Limitation**: Generated parsers produce CST, not AST

- CST preserves all syntax structure (correct for roundtrip)
- AST transforms to semantic tree (what we need for compiler)
- Need mapping layer between them

**Annotation Syntax:**

```ebnf
(* Map to existing AST *)
expr ::=
  | integer @map(EInt { span, value = $0.value })
  | expr @space "+" @space expr @map(EBinary { span, op = OpAdd, left = $0, right = $2 })
  ;
```

**Implementation Plan:**

1. Add `@map` annotation to EBNF syntax
2. Parse mapping expressions with variable references ($0, $1, etc.)
3. Generate AST construction code in parser
4. Validate map expressions match rule structure

**Module:** New `tools/ebnf_codegen_ast_mapper.tuff`
**Estimated Lines**: ~200-250 lines
**Effort**: 3-4 days
**Blockers**: Operator precedence (Phase 5) must be complete

### Phase 7: Formatting Directives 🔮 FUTURE

**Goal**: Control pretty-printing layout (advanced)

**Status**: NOT STARTED - Foundation laid (Phase 4)

**Directives:**

- `@space` - single space ✅ (already supported)
- `@break` - newline + indent ✅ (already supported)
- `@softbreak` - break if line exceeds width ❌
- `@indent(x)` - increase indent for x ✅ (already supported)
- `@align(x)` - align continuation to current column ❌
- `@group(x)` - try to fit x on one line, else break all ❌
- `@noSpace` - no space before/after ✅ (already supported)

**Advanced Features:**

- Implement Wadler's pretty-printing algebra
- Automatic line wrapping based on width
- Smart layout decisions

**Module:** Enhancement to `tools/ebnf_codegen_printer.tuff`
**Estimated Lines**: ~200-250 lines
**Effort**: 1 week
**Blockers**: None - can work in parallel

### Phase 8: Left-Recursion Detection & Elimination 🔮 FUTURE

**Goal**: Handle left-recursive rules automatically

**Status**: NOT STARTED - Design complete

**Approach:**

1. Detect left-recursive rules
2. Transform to right-recursive equivalent
3. Generate equivalent parser

**Complexity**: ~100-150 lines
**Effort**: 3-4 days
**Priority**: Low (most practical grammars avoid left recursion)

### Phase 9: Integration & Build System 🔮 FUTURE

**Goal**: Use generated parser/printer in compiler build

**Build Process:**

```bash
# Generate parser and printer from grammar
tuff codegen tuff.ebnf --output src/main/tuff/compiler/generated/
```

**What This Does:**

1. Run EBNF parser on grammar file
2. Validate grammar
3. Generate Tuff parser code
4. Generate Tuff printer code
5. Compile generated code
6. Output to specified directory

**Implementation:**

- CLI tool in `tools/ebnf_cli.tuff`
- Integration with build system
- Automatic regeneration on grammar changes

**Module:** New `tools/ebnf_cli.tuff`
**Estimated Lines**: ~100-150 lines
**Effort**: 2-3 days

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

## Realistic Timeline (December 2025)

### Completed Work: ~4 weeks

| Phase                | Effort  | Status     | Delivered                     |
| -------------------- | ------- | ---------- | ----------------------------- |
| Phase 1: EBNF Parser | 1 week  | ✅ DONE    | Parse EBNF files              |
| Phase 2: Validation  | 3 days  | ✅ DONE    | Check grammar well-formedness |
| Phase 3: Parser Gen  | 1.5 wks | ✅ PARTIAL | Core parser generation        |
| Phase 4: Printer Gen | 1.5 wks | ✅ PARTIAL | Basic pretty-printing         |

### Remaining Work: ~4-5 weeks to MVP

| Phase                 | Effort   | Status     | Blockers          |
| --------------------- | -------- | ---------- | ----------------- |
| Fix Union Variant Bug | 2-3 days | 🔴 BLOCKED | None - start now  |
| Phase 5: Precedence   | 1 week   | 🔴 TODO    | Union variant fix |
| Phase 6: AST Mapping  | 3-4 days | 🔴 TODO    | Phase 5 complete  |
| End-to-End Test       | 2-3 days | 🔴 TODO    | Phase 6 complete  |
| Phase 7: Formatting   | 1 week   | 🟡 LATER   | None (parallel)   |
| Phase 8: L-Recursion  | 3-4 days | 🟡 LATER   | None (optional)   |
| Phase 9: Integration  | 2-3 days | 🟡 LATER   | Phase 6 complete  |

**MVP Timeline:** ~4-5 weeks (with union variant fix as critical path)
**Full System:** ~6-7 weeks (including formatting directives)
**Optimization:** +1-2 weeks (performance, error messages)

## Known Issues & Technical Challenges

### 🔴 Critical Issues

1. **Union Variants Across Modules** (BLOCKER)

   - Problem: Union variants like `EInt`, `EBool` cause infinite loops when imported cross-module
   - Symptom: Tests crash with "JavaScript heap out of memory"
   - Root Cause: Likely issue in how `is` operator works for union variants across module boundaries
   - Current Impact: Can't test transpiler or any code using imported AST types
   - Fix Strategy: Debug runtime behavior, likely needs changes to module system or type checking

2. **Missing Operator Precedence** (PHASE 5 BLOCKER)
   - Problem: Parser generator doesn't handle precedence/associativity
   - Symptom: `a + b * c` parses as `(a + b) * c` instead of `a + (b * c)`
   - Impact: Can't parse real expressions correctly
   - Fix: Implement precedence climbing algorithm in parser codegen

### 🟠 Medium Priority Issues

3. **Comment Preservation**

   - Problem: Comments are stripped during parsing
   - Impact: Can't implement true code formatter (loses source information)
   - Workaround: Acceptable for MVP; can add trivia tracking later

4. **Error Recovery**
   - Problem: Generated parsers panic on first error
   - Impact: Poor user experience with error messages
   - Workaround: Acceptable for MVP; can add panic recovery points later

### 🟡 Performance Considerations

5. **Large File Performance**
   - Problem: Generated recursive descent parser may be slow on large files
   - Estimated Impact: May exceed 500ms for 10k LOC files
   - Mitigation: Memoization, lookahead caching

## Advantages of EBNF-Driven Approach

| Aspect                | Manual Parser Code           | EBNF Generator                            |
| --------------------- | ---------------------------- | ----------------------------------------- |
| Grammar Specification | Implicit in code             | Explicit, documented                      |
| Maintenance           | Update multiple functions    | Update grammar once                       |
| Correctness           | Manual verification          | Generated code is correct by construction |
| Extensibility         | Add parsing logic everywhere | Add one grammar rule                      |
| Documentation         | Code comments                | Grammar IS the documentation              |
| Roundtrip Guarantee   | Manual implementation        | Built-in to CST approach                  |
| Self-Hosting          | Manual bootstrap             | Automatic (grammar parses itself)         |

## Recommended Next Steps (Action Items)

### Week 1: Fix Critical Blocker

1. **Debug Union Variant Issue** (2-3 days)

   - Reproduce infinite loop in test environment
   - Check if issue is in `is` operator or module system
   - Create minimal reproduction case
   - Fix root cause (likely in analyzer or runtime)

2. **Re-enable Transpiler Testing** (1 day)
   - Rewrite transpiler tests without cross-module types
   - Verify memory issue is resolved
   - Create simple end-to-end transpiler test

### Week 2-3: Complete Phase 5 (Operator Precedence)

1. **Design Precedence Algorithm** (1 day)

   - Document how to extract precedence table from grammar
   - Design precedence climbing code generation
   - Specify algorithm for handling mixed-associativity

2. **Implement Parser Codegen Enhancement** (3-4 days)

   - Add precedence annotation parsing to Phase 2 validator
   - Modify Phase 3 parser generator for precedence climbing
   - Generate correct precedence-respecting parser

3. **Test on Real Tuff Grammar** (1-2 days)
   - Parse actual Tuff expressions with generated parser
   - Verify AST shape is correct
   - Compare with existing parser output

### Week 4: Complete Phase 6 (AST Mapping)

1. **Design AST Mapping System** (1 day)

   - Design `@map` annotation syntax
   - Specify variable reference system ($0, $1, ...)
   - Document semantic validation rules

2. **Implement AST Mapper** (2-3 days)
   - Parse `@map` annotations
   - Generate AST construction code
   - Validate mappings against rule structure

### Week 5: Integration Testing

1. **End-to-End Parse/Emit Test** (2-3 days)

   - Parse full Tuff source files
   - Emit back to source code
   - Verify round-trip: `parse(emit(parse(x))) == parse(x)`
   - Test on compiler source tree

2. **Performance Profiling** (1-2 days)
   - Measure parse times on large files
   - Identify bottlenecks
   - Optimize if needed

### Success Criteria for MVP

- ✅ Parse arbitrary Tuff code without errors
- ✅ Roundtrip guarantee: `parse(emit(parse(x))) == parse(x)`
- ✅ Generated parser produces correct AST
- ✅ All 89 existing tests pass
- ✅ Parse time < 500ms for 10k LOC
- ✅ No semantic bugs from formatting
