use crate::ast::*;
use crate::lexer::{Lexer, Token};

pub struct Parser {
    tokens: Vec<Token>,
    position: usize,
}

impl Parser {
    pub fn new(input: &str) -> Self {
        let mut lexer = Lexer::new(input);
        let tokens = lexer.tokenize();
        Parser {
            tokens,
            position: 0,
        }
    }

    fn current(&self) -> &Token {
        self.tokens.get(self.position).unwrap_or(&Token::Eof)
    }

    fn peek(&self) -> &Token {
        self.tokens.get(self.position + 1).unwrap_or(&Token::Eof)
    }

    fn advance(&mut self) {
        if !matches!(self.current(), Token::Eof) {
            self.position += 1;
        }
    }

    fn expect(&mut self, expected: Token) -> Result<(), String> {
        if std::mem::discriminant(self.current()) == std::mem::discriminant(&expected) {
            self.advance();
            Ok(())
        } else {
            Err(format!("Expected {:?}, got {:?}", expected, self.current()))
        }
    }

    pub fn parse(&mut self) -> Result<Program, String> {
        let mut statements = Vec::new();
        while !matches!(self.current(), Token::Eof) {
            statements.push(self.parse_statement()?);
        }
        Ok(Program { statements })
    }

    // ==================== Type Parsing ====================
    /// Parse a complete type: prefix operators (*, &) followed by base type, then postfix operators
    fn parse_type(&mut self) -> Result<Type, String> {
        // Handle prefix operators: &T, &mut T, *T
        let mut is_mutable_ref = false;
        let mut is_pointer = false;

        loop {
            match self.current() {
                Token::Ampersand => {
                    self.advance();
                    if matches!(self.current(), Token::Mut) {
                        is_mutable_ref = true;
                        self.advance();
                    }
                    // We'll apply this after parsing the base type
                    break;
                }
                Token::Star => {
                    is_pointer = true;
                    self.advance();
                    break;
                }
                _ => break,
            }
        }

        let mut base = self.parse_base_type()?;

        // Apply prefix modifiers
        if is_mutable_ref {
            base = Type::MutableReference(Box::new(base));
        } else if is_pointer {
            base = Type::Pointer(Box::new(base));
        }

        // Handle postfix operators: &T, &mut T, *T (after base type)
        self.parse_type_with_postfix(base)
    }

    /// Parse base type (primitives, generics, identifiers, tuples)
    fn parse_base_type(&mut self) -> Result<Type, String> {
        match self.current() {
            Token::U8 => {
                self.advance();
                Ok(Type::U8)
            }
            Token::U16 => {
                self.advance();
                Ok(Type::U16)
            }
            Token::U32 => {
                self.advance();
                Ok(Type::U32)
            }
            Token::U64 => {
                self.advance();
                Ok(Type::U64)
            }
            Token::I8 => {
                self.advance();
                Ok(Type::I8)
            }
            Token::I16 => {
                self.advance();
                Ok(Type::I16)
            }
            Token::I32 => {
                self.advance();
                Ok(Type::I32)
            }
            Token::I64 => {
                self.advance();
                Ok(Type::I64)
            }
            Token::F32 => {
                self.advance();
                Ok(Type::F32)
            }
            Token::F64 => {
                self.advance();
                Ok(Type::F64)
            }
            Token::Bool => {
                self.advance();
                Ok(Type::Bool)
            }
            Token::Char => {
                self.advance();
                Ok(Type::Char)
            }
            Token::StringType => {
                self.advance();
                Ok(Type::String)
            }
            Token::Void => {
                self.advance();
                Ok(Type::Void)
            }
            Token::Identifier(name) => {
                let name = name.clone();
                self.advance();
                // Check for generic parameters: Vec<I32>
                if matches!(self.current(), Token::Less) {
                    self.advance();
                    let mut type_args = Vec::new();
                    while !matches!(self.current(), Token::Greater) {
                        type_args.push(self.parse_type()?);
                        if matches!(self.current(), Token::Comma) {
                            self.advance();
                        }
                    }
                    self.expect(Token::Greater)?;
                    Ok(Type::Generic(name, type_args))
                } else {
                    // Simple identifier - treat as type parameter (e.g., T, U)
                    Ok(Type::TypeParameter(name))
                }
            }
            Token::LeftBracket => {
                // Tuple: [T1, T2, T3] or Array: [T; init; length]
                self.advance();
                let first_type = self.parse_type()?;

                if matches!(self.current(), Token::Comma) {
                    // Tuple
                    self.advance();
                    let mut types = vec![first_type];
                    while !matches!(self.current(), Token::RightBracket) {
                        types.push(self.parse_type()?);
                        if matches!(self.current(), Token::Comma) {
                            self.advance();
                        }
                    }
                    self.expect(Token::RightBracket)?;
                    Ok(Type::Tuple(types))
                } else if matches!(self.current(), Token::Semicolon) {
                    // Array: [T; init; length]
                    self.advance();
                    // Parse init value (as number for now)
                    let init = match self.current() {
                        Token::Number(n) => {
                            let n = *n as usize;
                            self.advance();
                            n
                        }
                        _ => return Err("Expected number for array init in type".to_string()),
                    };
                    self.expect(Token::Semicolon)?;
                    let length = match self.current() {
                        Token::Number(n) => {
                            let n = *n as usize;
                            self.advance();
                            n
                        }
                        _ => return Err("Expected number for array length in type".to_string()),
                    };
                    self.expect(Token::RightBracket)?;
                    Ok(Type::Array(Box::new(first_type), init, length))
                } else {
                    // Single-element "tuple" or just [T]
                    self.expect(Token::RightBracket)?;
                    Ok(Type::Tuple(vec![first_type]))
                }
            }
            Token::Pipe => {
                // Union type: T | E | U (function pointer prefix)
                // Actually, pipe usually means function pointer, but for now parse as union
                self.advance();
                let mut union_types = vec![self.parse_base_type()?];
                while matches!(self.current(), Token::Pipe) {
                    self.advance();
                    union_types.push(self.parse_base_type()?);
                }
                self.expect(Token::Pipe)?;
                Ok(Type::Union(union_types))
            }
            _ => Err(format!("Unexpected token in type: {:?}", self.current())),
        }
    }

    /// Apply postfix operators to a base type: &T, &mut T, *T
    fn parse_type_with_postfix(&mut self, mut base: Type) -> Result<Type, String> {
        loop {
            match self.current() {
                Token::Ampersand => {
                    self.advance();
                    if matches!(self.current(), Token::Mut) {
                        self.advance();
                        base = Type::MutableReference(Box::new(base));
                    } else {
                        base = Type::Reference(Box::new(base));
                    }
                }
                Token::Star => {
                    self.advance();
                    base = Type::Pointer(Box::new(base));
                }
                _ => break,
            }
        }
        Ok(base)
    }

    // ==================== Statement Parsing ====================

    fn parse_statement(&mut self) -> Result<Stmt, String> {
        match self.current() {
            Token::Let => self.parse_let(),
            Token::Fn => self.parse_function(),
            Token::If => self.parse_if(),
            Token::While => self.parse_while(),
            Token::For => self.parse_for(),
            Token::Return => self.parse_return(),
            Token::LeftBrace => self.parse_block(),
            Token::Identifier(_) => {
                // Try to parse assignment
                let checkpoint = self.position;
                if let Token::Identifier(name) = self.current().clone() {
                    self.advance();
                    if matches!(self.current(), Token::Equal) {
                        self.advance();
                        let value = self.parse_expression()?;
                        if matches!(self.current(), Token::Semicolon) {
                            self.advance();
                        }
                        return Ok(Stmt::Assign { name, value });
                    }
                }
                // Reset and parse as expression statement
                self.position = checkpoint;
                self.parse_expression_statement()
            }
            _ => self.parse_expression_statement(),
        }
    }

    fn parse_let(&mut self) -> Result<Stmt, String> {
        self.expect(Token::Let)?;
        let name = match self.current().clone() {
            Token::Identifier(n) => {
                self.advance();
                n
            }
            _ => return Err("Expected identifier after 'let'".to_string()),
        };

        // Parse optional type annotation: : Type
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

    fn parse_function(&mut self) -> Result<Stmt, String> {
        self.expect(Token::Fn)?;
        let name = match self.current().clone() {
            Token::Identifier(n) => {
                self.advance();
                n
            }
            _ => return Err("Expected function name".to_string()),
        };

        // Parse optional generic parameters: fn<T, U>
        let type_params = if matches!(self.current(), Token::Less) {
            self.advance();
            let mut params = Vec::new();
            while !matches!(self.current(), Token::Greater) {
                match self.current().clone() {
                    Token::Identifier(p) => {
                        params.push(p);
                        self.advance();
                    }
                    _ => return Err("Expected type parameter name".to_string()),
                }
                if matches!(self.current(), Token::Comma) {
                    self.advance();
                }
            }
            self.expect(Token::Greater)?;
            params
        } else {
            Vec::new()
        };

        self.expect(Token::LeftParen)?;
        let mut params = Vec::new();
        while !matches!(self.current(), Token::RightParen) {
            let param_name = match self.current().clone() {
                Token::Identifier(p) => {
                    self.advance();
                    p
                }
                _ => return Err("Expected parameter name".to_string()),
            };

            // Parse parameter type: name : Type
            self.expect(Token::Colon)?;
            let param_type = self.parse_type()?;
            params.push((param_name, param_type));

            if matches!(self.current(), Token::Comma) {
                self.advance();
            }
        }
        self.expect(Token::RightParen)?;

        // Parse optional return type: : Type
        let return_type = if matches!(self.current(), Token::Colon) {
            self.advance();
            self.parse_type()?
        } else {
            Type::Void  // Default return type
        };

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

    fn parse_if(&mut self) -> Result<Stmt, String> {
        self.expect(Token::If)?;
        self.expect(Token::LeftParen)?;
        let condition = self.parse_expression()?;
        self.expect(Token::RightParen)?;

        self.expect(Token::LeftBrace)?;
        let mut then_body = Vec::new();
        while !matches!(self.current(), Token::RightBrace) {
            then_body.push(self.parse_statement()?);
        }
        self.expect(Token::RightBrace)?;

        let else_body = if matches!(self.current(), Token::Else) {
            self.advance();
            self.expect(Token::LeftBrace)?;
            let mut body = Vec::new();
            while !matches!(self.current(), Token::RightBrace) {
                body.push(self.parse_statement()?);
            }
            self.expect(Token::RightBrace)?;
            Some(body)
        } else {
            None
        };

        Ok(Stmt::If {
            condition,
            then_body,
            else_body,
        })
    }

    fn parse_while(&mut self) -> Result<Stmt, String> {
        self.expect(Token::While)?;
        self.expect(Token::LeftParen)?;
        let condition = self.parse_expression()?;
        self.expect(Token::RightParen)?;

        self.expect(Token::LeftBrace)?;
        let mut body = Vec::new();
        while !matches!(self.current(), Token::RightBrace) {
            body.push(self.parse_statement()?);
        }
        self.expect(Token::RightBrace)?;

        Ok(Stmt::While { condition, body })
    }

    fn parse_for(&mut self) -> Result<Stmt, String> {
        self.expect(Token::For)?;
        let var = match self.current().clone() {
            Token::Identifier(v) => {
                self.advance();
                v
            }
            _ => return Err("Expected variable name in for loop".to_string()),
        };

        self.expect(Token::In)?;
        let iter = self.parse_expression()?;

        self.expect(Token::LeftBrace)?;
        let mut body = Vec::new();
        while !matches!(self.current(), Token::RightBrace) {
            body.push(self.parse_statement()?);
        }
        self.expect(Token::RightBrace)?;

        Ok(Stmt::For { var, iter, body })
    }

    fn parse_return(&mut self) -> Result<Stmt, String> {
        self.expect(Token::Return)?;
        let value = if matches!(self.current(), Token::Semicolon | Token::RightBrace) {
            None
        } else {
            Some(self.parse_expression()?)
        };
        if matches!(self.current(), Token::Semicolon) {
            self.advance();
        }
        Ok(Stmt::Return(value))
    }

    fn parse_block(&mut self) -> Result<Stmt, String> {
        self.expect(Token::LeftBrace)?;
        let mut statements = Vec::new();
        while !matches!(self.current(), Token::RightBrace) {
            statements.push(self.parse_statement()?);
        }
        self.expect(Token::RightBrace)?;
        Ok(Stmt::Block(statements))
    }

    fn parse_expression_statement(&mut self) -> Result<Stmt, String> {
        let expr = self.parse_expression()?;
        if matches!(self.current(), Token::Semicolon) {
            self.advance();
        }
        Ok(Stmt::Expression(expr))
    }

    fn parse_expression(&mut self) -> Result<Expr, String> {
        self.parse_ternary()
    }

    fn parse_ternary(&mut self) -> Result<Expr, String> {
        let expr = self.parse_logical_or()?;
        if matches!(self.current(), Token::Question) {
            self.advance();
            let then_expr = self.parse_expression()?;
            self.expect(Token::Colon)?;
            let else_expr = self.parse_expression()?;
            return Ok(Expr::Ternary {
                condition: Box::new(expr),
                then_expr: Box::new(then_expr),
                else_expr: Box::new(else_expr),
            });
        }
        Ok(expr)
    }

    fn parse_logical_or(&mut self) -> Result<Expr, String> {
        let mut expr = self.parse_logical_and()?;
        while matches!(self.current(), Token::PipePipe) {
            self.advance();
            let right = self.parse_logical_and()?;
            expr = Expr::Binary {
                left: Box::new(expr),
                op: BinOp::Or,
                right: Box::new(right),
            };
        }
        Ok(expr)
    }

    fn parse_logical_and(&mut self) -> Result<Expr, String> {
        let mut expr = self.parse_equality()?;
        while matches!(self.current(), Token::AmpersandAmpersand) {
            self.advance();
            let right = self.parse_equality()?;
            expr = Expr::Binary {
                left: Box::new(expr),
                op: BinOp::And,
                right: Box::new(right),
            };
        }
        Ok(expr)
    }

    fn parse_equality(&mut self) -> Result<Expr, String> {
        let mut expr = self.parse_comparison()?;
        loop {
            let op = match self.current() {
                Token::EqualEqual => BinOp::Equal,
                Token::BangEqual => BinOp::NotEqual,
                _ => break,
            };
            self.advance();
            let right = self.parse_comparison()?;
            expr = Expr::Binary {
                left: Box::new(expr),
                op,
                right: Box::new(right),
            };
        }
        Ok(expr)
    }

    fn parse_comparison(&mut self) -> Result<Expr, String> {
        let mut expr = self.parse_additive()?;
        loop {
            let op = match self.current() {
                Token::Less => BinOp::Less,
                Token::LessEqual => BinOp::LessEqual,
                Token::Greater => BinOp::Greater,
                Token::GreaterEqual => BinOp::GreaterEqual,
                _ => break,
            };
            self.advance();
            let right = self.parse_additive()?;
            expr = Expr::Binary {
                left: Box::new(expr),
                op,
                right: Box::new(right),
            };
        }
        Ok(expr)
    }

    fn parse_additive(&mut self) -> Result<Expr, String> {
        let mut expr = self.parse_multiplicative()?;
        loop {
            let op = match self.current() {
                Token::Plus => BinOp::Add,
                Token::Minus => BinOp::Subtract,
                _ => break,
            };
            self.advance();
            let right = self.parse_multiplicative()?;
            expr = Expr::Binary {
                left: Box::new(expr),
                op,
                right: Box::new(right),
            };
        }
        Ok(expr)
    }

    fn parse_multiplicative(&mut self) -> Result<Expr, String> {
        let mut expr = self.parse_unary()?;
        loop {
            let op = match self.current() {
                Token::Star => BinOp::Multiply,
                Token::Slash => BinOp::Divide,
                Token::Percent => BinOp::Modulo,
                _ => break,
            };
            self.advance();
            let right = self.parse_unary()?;
            expr = Expr::Binary {
                left: Box::new(expr),
                op,
                right: Box::new(right),
            };
        }
        Ok(expr)
    }

    fn parse_unary(&mut self) -> Result<Expr, String> {
        match self.current() {
            Token::Minus => {
                self.advance();
                Ok(Expr::Unary {
                    op: UnaryOp::Negate,
                    operand: Box::new(self.parse_unary()?),
                })
            }
            Token::Bang => {
                self.advance();
                Ok(Expr::Unary {
                    op: UnaryOp::Not,
                    operand: Box::new(self.parse_unary()?),
                })
            }
            _ => self.parse_postfix(),
        }
    }

    fn parse_postfix(&mut self) -> Result<Expr, String> {
        let mut expr = self.parse_primary()?;
        loop {
            match self.current() {
                Token::LeftParen => {
                    self.advance();
                    let mut args = Vec::new();
                    while !matches!(self.current(), Token::RightParen) {
                        args.push(self.parse_expression()?);
                        if matches!(self.current(), Token::Comma) {
                            self.advance();
                        }
                    }
                    self.expect(Token::RightParen)?;
                    expr = Expr::Call {
                        func: Box::new(expr),
                        args,
                    };
                }
                Token::LeftBracket => {
                    self.advance();
                    let index = self.parse_expression()?;
                    self.expect(Token::RightBracket)?;
                    expr = Expr::Index {
                        object: Box::new(expr),
                        index: Box::new(index),
                    };
                }
                _ => break,
            }
        }
        Ok(expr)
    }

    fn parse_primary(&mut self) -> Result<Expr, String> {
        match self.current().clone() {
            Token::Number(n) => {
                self.advance();
                Ok(Expr::Number(n))
            }
            Token::String(s) => {
                self.advance();
                Ok(Expr::String(s))
            }
            Token::True => {
                self.advance();
                Ok(Expr::Boolean(true))
            }
            Token::False => {
                self.advance();
                Ok(Expr::Boolean(false))
            }
            Token::Null => {
                self.advance();
                Ok(Expr::Null)
            }
            Token::Identifier(name) => {
                self.advance();
                Ok(Expr::Identifier(name))
            }
            Token::LeftParen => {
                self.advance();
                let expr = self.parse_expression()?;
                self.expect(Token::RightParen)?;
                Ok(expr)
            }
            Token::LeftBracket => {
                self.advance();
                let mut elements = Vec::new();
                while !matches!(self.current(), Token::RightBracket) {
                    elements.push(self.parse_expression()?);
                    if matches!(self.current(), Token::Comma) {
                        self.advance();
                    }
                }
                self.expect(Token::RightBracket)?;
                Ok(Expr::Array(elements))
            }
            _ => Err(format!("Unexpected token: {:?}", self.current())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_number() {
        let mut parser = Parser::new("42;");
        let program = parser.parse().unwrap();
        assert_eq!(program.statements.len(), 1);
    }

    #[test]
    fn test_parse_binary_op() {
        let mut parser = Parser::new("2 + 3;");
        let program = parser.parse().unwrap();
        assert_eq!(program.statements.len(), 1);
    }

    #[test]
    fn test_parse_function_def() {
        let mut parser = Parser::new("fn add(a : I32, b : I32) : I32 { return a + b; }");
        let program = parser.parse().unwrap();
        assert_eq!(program.statements.len(), 1);
    }

    #[test]
    fn test_parse_if_statement() {
        let mut parser = Parser::new("if (true) { 1; }");
        let program = parser.parse().unwrap();
        assert_eq!(program.statements.len(), 1);
    }
}
