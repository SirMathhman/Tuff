# Type System Implementation Plan

## Test Status: 27 Failing Tests ✅

The tests are in place and failing as expected (TDD). Here's what needs to be implemented to make them pass.

## Phase 2.1 Implementation Steps

### Step 1: Create `Type` Enum in AST

Add to [src/ast.rs](src/ast.rs):

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum Type {
    // Primitives
    U8, U16, U32, U64,
    I8, I16, I32, I64,
    F32, F64,
    Bool, Char, String, Void,

    // Pointers and references
    Reference(Box<Type>),      // &T
    MutableReference(Box<Type>), // &mut T
    Pointer(Box<Type>),        // *T

    // Collections
    Array(Box<Type>, usize, usize), // [T; Init; Length]
    Tuple(Vec<Type>),           // [T1, T2, T3]

    // Generics
    Generic(String, Vec<Type>), // Vec<I32>, Option<T>, etc.
    TypeParameter(String),      // T, U, etc. (for fn<T>)

    // Unions (for Result, Option)
    Union(Vec<Type>),           // T | E | U

    // Function pointers
    FunctionPointer(Vec<Type>, Box<Type>), // |Args...| => ReturnType
}
```

### Step 2: Update AST Statements to Store Types

Modify in [src/ast.rs](src/ast.rs):

**For `Let`:**
```rust
pub enum Stmt {
    Expression(Expr),

    Assign { name: String, value: Expr },

    Let {
        name: String,
        ty: Option<Type>,          // ADD THIS
        value: Option<Expr>,
    },

    // ... rest unchanged
}
```

**For `Function`:**
```rust
pub enum Stmt {
    // ...
    Function {
        name: String,
        type_params: Vec<String>,  // ADD THIS for generics
        params: Vec<(String, Type)>, // CHANGE: was Vec<String>, now with types
        return_type: Type,         // ADD THIS (required)
        body: Vec<Stmt>,
    },
    // ...
}
```

### Step 3: Add Type Keywords to Lexer

Add to [src/lexer.rs](src/lexer.rs) in the `Token` enum:

```rust
pub enum Token {
    // ... existing tokens ...

    // Type keywords (add to existing enum)
    U8, U16, U32, U64,
    I8, I16, I32, I64,
    F32, F64,
    Bool_Keyword,  // Avoid conflict with Bool value
    Char_Keyword,
    String_Keyword,
    Void,

    // New keywords for type features
    Mut,
    Struct,
    Trait,
    Impl,
    Match,
    Module,
    Use,
    From,
    Out,
    In,
    Is,

    // Reference/pointer operators (enhance existing)
    Ampersand,     // & (single, for references)
    Ampersand2,    // &mut (or keep AmpersandAmpersand and add Mut combination)

    // Other
    Pipe,          // | (union type separator)
    Semicolon2,    // Need to handle `;` in array types [T; 3; 5]

    Eof,
}
```

**In `read_identifier()` method, update keyword matching:**
```rust
match ident.as_str() {
    "let" => Token::Let,
    "fn" => Token::Fn,
    "if" => Token::If,
    // ... existing ...
    "U8" => Token::U8,
    "U16" => Token::U16,
    "U32" => Token::U32,
    "U64" => Token::U64,
    "I8" => Token::I8,
    "I16" => Token::I16,
    "I32" => Token::I32,
    "I64" => Token::I64,
    "F32" => Token::F32,
    "F64" => Token::F64,
    "Bool" => Token::Bool_Keyword,
    "Char" => Token::Char_Keyword,
    "String" => Token::String_Keyword,
    "Void" => Token::Void,
    "mut" => Token::Mut,
    "struct" => Token::Struct,
    "trait" => Token::Trait,
    "impl" => Token::Impl,
    "match" => Token::Match,
    "module" => Token::Module,
    "use" => Token::Use,
    "from" => Token::From,
    "out" => Token::Out,
    "in" => Token::In,
    "is" => Token::Is,
    _ => Token::Identifier(ident),
}
```

### Step 4: Add Type Parsing to Parser

Add new method to [src/parser.rs](src/parser.rs):

```rust
fn parse_type(&mut self) -> Result<Type, String> {
    self.parse_type_with_postfix()
}

fn parse_type_with_postfix(&mut self) -> Result<Type, String> {
    let mut ty = self.parse_base_type()?;

    // Handle postfix modifiers: *, &, &mut
    loop {
        match self.current() {
            Token::Star => {
                self.advance();
                ty = Type::Pointer(Box::new(ty));
            }
            Token::Ampersand => {
                self.advance();
                if matches!(self.current(), Token::Mut) {
                    self.advance();
                    ty = Type::MutableReference(Box::new(ty));
                } else {
                    ty = Type::Reference(Box::new(ty));
                }
            }
            _ => break,
        }
    }

    Ok(ty)
}

fn parse_base_type(&mut self) -> Result<Type, String> {
    match self.current() {
        Token::U8 => { self.advance(); Ok(Type::U8) }
        Token::U16 => { self.advance(); Ok(Type::U16) }
        Token::U32 => { self.advance(); Ok(Type::U32) }
        Token::U64 => { self.advance(); Ok(Type::U64) }
        Token::I8 => { self.advance(); Ok(Type::I8) }
        Token::I16 => { self.advance(); Ok(Type::I16) }
        Token::I32 => { self.advance(); Ok(Type::I32) }
        Token::I64 => { self.advance(); Ok(Type::I64) }
        Token::F32 => { self.advance(); Ok(Type::F32) }
        Token::F64 => { self.advance(); Ok(Type::F64) }
        Token::Bool_Keyword => { self.advance(); Ok(Type::Bool) }
        Token::Char_Keyword => { self.advance(); Ok(Type::Char) }
        Token::String_Keyword => { self.advance(); Ok(Type::String) }
        Token::Void => { self.advance(); Ok(Type::Void) }
        
        // Generic types: Vec<I32>, Option<String>
        Token::Identifier(name) => {
            let name = name.clone();
            self.advance();
            
            if matches!(self.current(), Token::Less) {
                self.advance();
                let mut type_args = vec![self.parse_type()?];
                while matches!(self.current(), Token::Comma) {
                    self.advance();
                    type_args.push(self.parse_type()?);
                }
                self.expect(Token::Greater)?;
                Ok(Type::Generic(name, type_args))
            } else {
                // Could be a type parameter (T, U, etc.)
                Ok(Type::TypeParameter(name))
            }
        }

        // Tuple or array: [T, U] or [T; 3; 5]
        Token::LeftBracket => {
            self.advance();
            let first_type = self.parse_type()?;
            
            if matches!(self.current(), Token::Semicolon) {
                // Array type: [T; Init; Length]
                self.advance();
                let init = self.parse_number()? as usize;
                self.expect(Token::Semicolon)?;
                let length = self.parse_number()? as usize;
                self.expect(Token::RightBracket)?;
                Ok(Type::Array(Box::new(first_type), init, length))
            } else if matches!(self.current(), Token::Comma) {
                // Tuple type: [T, U, V]
                let mut types = vec![first_type];
                while matches!(self.current(), Token::Comma) {
                    self.advance();
                    if matches!(self.current(), Token::RightBracket) { break; }
                    types.push(self.parse_type()?);
                }
                self.expect(Token::RightBracket)?;
                Ok(Type::Tuple(types))
            } else {
                // Single element in brackets (treat as tuple with 1 element)
                self.expect(Token::RightBracket)?;
                Ok(Type::Tuple(vec![first_type]))
            }
        }

        Token::Pipe => {
            // Union type: T | E | U
            let mut types = vec![];
            while matches!(self.current(), Token::Pipe) {
                self.advance();
                types.push(self.parse_type()?);
            }
            Ok(Type::Union(types))
        }

        // Function pointer: |Args...| => ReturnType
        // (This is tricky - parse after primary type if | | =>)
        
        _ => Err(format!("Unexpected token in type: {:?}", self.current())),
    }
}

fn parse_number(&mut self) -> Result<f64, String> {
    match self.current() {
        Token::Number(n) => {
            let num = *n;
            self.advance();
            Ok(num)
        }
        _ => Err("Expected number".to_string()),
    }
}
```

### Step 5: Update `parse_let()` to Consume Type

Modify in [src/parser.rs](src/parser.rs):

```rust
fn parse_let(&mut self) -> Result<Stmt, String> {
    self.expect(Token::Let)?;
    let name = match self.current().clone() {
        Token::Identifier(n) => {
            self.advance();
            n
        }
        _ => return Err("Expected identifier after 'let'".to_string()),
    };

    let ty = if matches!(self.current(), Token::Colon) {
        self.advance();
        Some(self.parse_type()?)
    } else {
        None
    };

    let value = if matches!(self.current(), Token::Equal) {
        self.advance();
        Some(self.parse_expression()?)
    } else {
        None
    };

    if matches!(self.current(), Token::Semicolon) {
        self.advance();
    }

    Ok(Stmt::Let { name, ty, value })
}
```

### Step 6: Update `parse_function()` to Consume Parameter & Return Types

Modify in [src/parser.rs](src/parser.rs):

```rust
fn parse_function(&mut self) -> Result<Stmt, String> {
    self.expect(Token::Fn)?;
    let name = match self.current().clone() {
        Token::Identifier(n) => {
            self.advance();
            n
        }
        _ => return Err("Expected function name".to_string()),
    };

    // Parse type parameters if present: <T, U>
    let type_params = if matches!(self.current(), Token::Less) {
        self.advance();
        let mut params = Vec::new();
        loop {
            match self.current() {
                Token::Identifier(p) => {
                    params.push(p.clone());
                    self.advance();
                }
                _ => return Err("Expected type parameter name".to_string()),
            }
            if matches!(self.current(), Token::Greater) {
                self.advance();
                break;
            }
            self.expect(Token::Comma)?;
        }
        params
    } else {
        Vec::new()
    };

    self.expect(Token::LeftParen)?;
    let mut params = Vec::new();
    while !matches!(self.current(), Token::RightParen) {
        match self.current().clone() {
            Token::Identifier(p) => {
                self.advance();
                self.expect(Token::Colon)?;
                let param_type = self.parse_type()?;
                params.push((p, param_type));
            }
            _ => return Err("Expected parameter name".to_string()),
        }
        if matches!(self.current(), Token::Comma) {
            self.advance();
        }
    }
    self.expect(Token::RightParen)?;

    self.expect(Token::Colon)?;
    let return_type = self.parse_type()?;

    self.expect(Token::Arrow)?;

    self.expect(Token::LeftBrace)?;
    let mut body = Vec::new();
    while !matches!(self.current(), Token::RightBrace) {
        body.push(self.parse_statement()?);
    }
    self.expect(Token::RightBrace)?;

    Ok(Stmt::Function {
        name,
        type_params,
        params,
        return_type,
        body,
    })
}
```

### Step 7: Update Evaluator to Accept Types (No Validation Yet)

Modify in [src/value.rs](src/value.rs):

```rust
fn eval_statement(&mut self, stmt: &crate::ast::Stmt) -> Result<EvalResult, String> {
    use crate::ast::Stmt;
    match stmt {
        Stmt::Let { name, ty, value } => {
            // For now, just ignore the type annotation
            // Phase 2.2 will add type checking
            let val = match value {
                Some(expr) => self.eval_expression(expr)?,
                None => Value::Null,
            };
            self.env.define(name.clone(), val);
            Ok(EvalResult::Value(Value::Null))
        }
        // ... rest of match unchanged, but update Function match arm:
        Stmt::Function {
            name,
            type_params,    // Ignore for now
            params,
            return_type,    // Ignore for now
            body,
        } => {
            let func = Value::Function {
                params: params.iter().map(|(p, _)| p.clone()).collect(), // Extract names only
                body: body.clone(),
                closure: self.env.clone(),
            };
            self.env.define(name.clone(), func);
            Ok(EvalResult::Value(Value::Null))
        }
        // ... rest unchanged
    }
}
```

## Key Files to Modify

1. **src/ast.rs** - Add `Type` enum and update `Let`, `Function` variants
2. **src/lexer.rs** - Add type keywords and update `Token` enum
3. **src/parser.rs** - Add type parsing methods and update `parse_let`, `parse_function`
4. **src/value.rs** - Update to accept types without validating (yet)

## Tests Expected to Pass After Implementation

- ✅ All 27 currently failing type system tests
- ✅ All 32 existing unit tests (no regressions)
- ✅ No semantic validation yet (Phase 2.2)
- ✅ Types are parsed and stored in AST

## Not In Scope (Phase 2.2+)

- Type checking/validation
- Type inference
- Generic type instantiation
- Struct definitions
- Trait definitions
- Pattern matching validation
