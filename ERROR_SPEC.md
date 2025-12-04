# Tuff Compiler Error Reporting System

## 1. Error System Architecture

### 1.1 Error Structure

```rust
pub struct Span {
    pub filename: String,
    pub line: usize,
    pub column: usize,
    pub length: usize,
}

pub enum ErrorKind {
    // Syntax errors
    UnexpectedToken,
    UnexpectedEndOfInput,
    InvalidLiteral,
    MalformedExpression,

    // Type errors
    TypeMismatch { expected: String, found: String },
    UndefinedType,
    GenericMismatch { expected: usize, found: usize },
    TraitNotImplemented { trait_name: String, type_name: String },

    // Borrow errors
    CannotBorrowMutableTwice,
    CannotBorrowWhileBorrowed,
    CannotMoveWhileBorrowed,
    InvalidBorrowScope,
    ReferenceOutlivesValue,

    // Name resolution errors
    UndefinedVariable,
    UndefinedFunction,
    UndefinedType,
    DuplicateDefinition,
    NotInScope,

    // Other errors
    InvalidOperator,
    InvalidPattern,
    UnreachableCode,
}

pub struct CompileError {
    pub kind: ErrorKind,
    pub span: Span,
    pub message: String,
    pub fix: Option<String>,  // Recommended fix
}

pub struct Diagnostic {
    pub error: CompileError,
}
```

### 1.2 Error Categories

1. **Syntax Errors**: Parser failures, unexpected tokens
2. **Type Errors**: Type mismatches, inference failures, generic parameter mismatches
3. **Borrow Errors**: Ownership violations, multiple mutable borrows, use-after-move
4. **Name Resolution Errors**: Undefined variables/functions, duplicate definitions, scoping issues
5. **Semantic Errors**: Invalid patterns, unreachable code, invalid operators

## 2. Error Reporting Format

### 2.1 Output Format

```
error[E<code>]: <error-message>
 --> <filename>:<line>:<column>
  |
<line> | <source-code>
  |     <pointer-to-error>
  |
note: <recommended-fix>
```

### 2.2 Example Error Output

```
error[E0001]: Type mismatch
 --> examples/test.tuff:5:15
  |
5 | let x: i32 = true;
  |               ^^^^ expected `i32`, found `bool`
  |
note: Try removing the assignment or changing the value to an integer literal

error[E0010]: Undefined variable
 --> examples/test.tuff:8:5
  |
8 | let y = z + 1;
  |         ^ variable `z` not found
  |
note: Did you mean `x`? (defined at line 5)
```

### 2.3 Multi-Error Support

The compiler collects errors during a phase before reporting:

```rust
pub struct ErrorCollector {
    pub errors: Vec<CompileError>,
}

impl ErrorCollector {
    pub fn add_error(&mut self, error: CompileError) {
        self.errors.push(error);
    }

    pub fn report(&self) -> bool {
        if self.errors.is_empty() {
            return false;
        }
        for error in &self.errors {
            self.print_error(error);
        }
        true
    }

    pub fn has_errors(&self) -> bool {
        !self.errors.is_empty()
    }
}
```

## 3. Error Codes Reference

| Code  | Category | Description                      |
| ----- | -------- | -------------------------------- |
| E0001 | Type     | Type mismatch                    |
| E0002 | Type     | Undefined type                   |
| E0003 | Type     | Generic parameter count mismatch |
| E0004 | Type     | Trait not implemented            |
| E0010 | Name     | Undefined variable               |
| E0011 | Name     | Undefined function               |
| E0012 | Name     | Duplicate definition             |
| E0013 | Name     | Not in scope                     |
| E0020 | Borrow   | Cannot borrow mutable twice      |
| E0021 | Borrow   | Cannot borrow while borrowed     |
| E0022 | Borrow   | Cannot move while borrowed       |
| E0023 | Borrow   | Invalid borrow scope             |
| E0024 | Borrow   | Reference outlives value         |
| E0030 | Syntax   | Unexpected token                 |
| E0031 | Syntax   | Unexpected end of input          |
| E0032 | Syntax   | Invalid literal                  |
| E0033 | Syntax   | Malformed expression             |
| E0040 | Semantic | Invalid operator                 |
| E0041 | Semantic | Invalid pattern                  |
| E0042 | Semantic | Unreachable code                 |

## 4. Error Message Guidelines

### 4.1 Syntax Errors

**Pattern**: `Unexpected <thing>, expected <expected-thing>`

Example:

```
error[E0030]: Unexpected token '42'
 --> test.tuff:3:8
  |
3 | let x 42;
  |        ^^ expected '=' after variable name
```

### 4.2 Type Errors

**Pattern**: `Expected <type>, found <type>`

Example:

```
error[E0001]: Type mismatch
 --> test.tuff:5:15
  |
5 | let x: i32 = "hello";
  |               ^^^^^^^ expected `i32`, found `&str`
  |
note: Try converting the string to an integer with `.parse()`
```

### 4.3 Borrow Errors

**Pattern**: `Cannot <action> because <reason>`

Example:

```
error[E0020]: Cannot borrow `x` as mutable more than once
 --> test.tuff:8:13
  |
7 | let r1 = &mut x;
  |          ------ first mutable borrow here
8 | let r2 = &mut x;
  |          ^^^^^^ second mutable borrow here
  |
note: Consider restructuring your code to avoid overlapping borrows
```

### 4.4 Name Resolution Errors

**Pattern**: `<name> not found in this scope`

Example:

```
error[E0010]: Variable `z` not found
 --> test.tuff:6:8
  |
6 | let y = z + 1;
  |         ^ not in scope
  |
note: Did you mean `x`? (defined at line 5)
```

## 5. Recommended Fixes (Fix Suggestions)

### 5.1 Common Fix Patterns

1. **Type Mismatch**: Suggest type conversion, casting, or dereferencing
2. **Undefined Variable**: Suggest closest matching variable in scope (Levenshtein distance)
3. **Borrow Conflict**: Suggest restructuring code or extending/shortening borrow scope
4. **Missing Symbol**: Suggest import or definition location

### 5.2 Implementation Strategy

```rust
impl CompileError {
    pub fn suggest_fix(&self) -> Option<String> {
        match &self.kind {
            ErrorKind::TypeMismatch { expected, found } => {
                if expected == "i32" && found == "bool" {
                    Some("Try converting the boolean to an integer".to_string())
                } else if expected == "&str" && found == "String" {
                    Some("Try dereferencing with `&`".to_string())
                } else {
                    Some(format!("Try converting from {} to {}", found, expected))
                }
            }
            ErrorKind::UndefinedVariable => {
                Some("Check the variable name or define it earlier in the scope".to_string())
            }
            ErrorKind::CannotBorrowMutableTwice => {
                Some("Consider restructuring your code to avoid overlapping borrows".to_string())
            }
            _ => None,
        }
    }
}
```

## 6. Error Recovery Strategy

### 6.1 Phase-Level Error Handling

- **Lexer**: Single error stop (cannot continue past invalid token)
- **Parser**: Single error stop (cannot continue past unexpected token)
- **Type Checker**: Collect all errors, report at end
- **Borrow Checker**: Collect all errors, report at end

### 6.2 Rationale

- Lexer/Parser errors are structural; continuing often produces cascade errors
- Type/Borrow checking benefits from collecting multiple errors for user clarity

## 7. Testing Error Messages

### 7.1 Error Message Test Format

```rust
#[test]
fn test_type_mismatch_error() {
    let source = r#"
        fn main() {
            let x: i32 = true;
        }
    "#;

    let errors = compile(source);
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0].kind, ErrorKind::TypeMismatch);
    assert!(errors[0].fix.is_some());
}
```

### 7.2 Error Output Validation

- Verify error code is correct
- Verify filename, line, column are accurate
- Verify error message is clear and actionable
- Verify fix suggestion is relevant (if provided)
