// Parser Module - Recursive Descent Parser for Tuff

use crate::compiler::ast::*;
use crate::compiler::error::{CompileError, ErrorKind, Span};
use crate::compiler::lexer::{Token, TokenKind};

pub struct Parser {
    tokens: Vec<Token>,
    position: usize,
    current_filename: String,
}

impl Parser {
    pub fn new(tokens: Vec<Token>, filename: String) -> Self {
        Parser {
            tokens,
            position: 0,
            current_filename: filename,
        }
    }

    pub fn parse(&mut self) -> Result<Program, Vec<CompileError>> {
        let mut items = Vec::new();
        let mut errors = Vec::new();

        while !self.is_at_end() {
            match self.parse_item() {
                Ok(item) => items.push(item),
                Err(e) => {
                    errors.push(e);
                    // Try to recover by skipping to next semicolon or brace
                    self.recover();
                }
            }
        }

        if errors.is_empty() {
            Ok(Program { items })
        } else {
            Err(errors)
        }
    }

    fn parse_item(&mut self) -> Result<Item, CompileError> {
        match &self.current()?.kind {
            TokenKind::Fn => self.parse_function_def().map(Item::FunctionDef),
            TokenKind::Type => self.parse_type_def().map(Item::TypeDef),
            TokenKind::Extern => self.parse_extern_block().map(Item::ExternBlock),
            _ => Err(CompileError::new(
                ErrorKind::UnexpectedToken {
                    expected: "fn, type, or extern".to_string(),
                    found: format!("{:?}", self.current()?.kind),
                },
                self.current()?.span.clone(),
                "unexpected token in item position",
            )),
        }
    }

    fn parse_function_def(&mut self) -> Result<FunctionDef, CompileError> {
        let fn_span = self.consume(TokenKind::Fn)?.span.clone();
        let name = self.parse_identifier()?;
        self.consume(TokenKind::LeftParen)?;
        let parameters = self.parse_parameters()?;
        self.consume(TokenKind::RightParen)?;

        let return_type = if self.match_token(&TokenKind::Arrow) {
            Some(self.parse_type()?)
        } else {
            None
        };

        let body = self.parse_block()?;

        Ok(FunctionDef {
            name,
            parameters,
            return_type,
            body,
            span: fn_span,
        })
    }

    fn parse_parameters(&mut self) -> Result<Vec<Parameter>, CompileError> {
        let mut params = Vec::new();

        if self.check(&TokenKind::RightParen) {
            return Ok(params);
        }

        loop {
            let param_name = self.parse_identifier()?;
            self.consume(TokenKind::Colon)?;
            let param_type = self.parse_type()?;
            let span = Span::new(&self.current_filename, 0, 0, 0); // TODO: proper span

            params.push(Parameter {
                name: param_name,
                ty: param_type,
                span,
            });

            if !self.match_token(&TokenKind::Comma) {
                break;
            }
        }

        Ok(params)
    }

    fn parse_type(&mut self) -> Result<Type, CompileError> {
        if self.match_token(&TokenKind::Ampersand) {
            let is_mutable = self.match_token(&TokenKind::Mut);
            let inner = self.parse_type()?;
            return Ok(Type::Reference(Box::new(inner), is_mutable));
        }

        // Handle keyword types like "void"
        if self.match_token(&TokenKind::Void) {
            return Ok(Type::void());
        }

        let base_name = self.parse_identifier()?;

        // Check for generic type parameters
        if self.match_token(&TokenKind::Less) {
            let mut type_args = vec![self.parse_type()?];
            while self.match_token(&TokenKind::Comma) {
                type_args.push(self.parse_type()?);
            }
            self.consume(TokenKind::Greater)?;
            Ok(Type::Generic(base_name, type_args))
        } else {
            match base_name.as_str() {
                "i32" => Ok(Type::i32()),
                "i64" => Ok(Type::i64()),
                "f32" => Ok(Type::f32()),
                "f64" => Ok(Type::f64()),
                "bool" => Ok(Type::bool()),
                _ => Ok(Type::Named(base_name)),
            }
        }
    }

    fn parse_type_def(&mut self) -> Result<TypeDef, CompileError> {
        let type_span = self.consume(TokenKind::Type)?.span.clone();
        let name = self.parse_identifier()?;

        let type_params = if self.match_token(&TokenKind::Less) {
            let mut params = vec![self.parse_identifier()?];
            while self.match_token(&TokenKind::Comma) {
                params.push(self.parse_identifier()?);
            }
            self.consume(TokenKind::Greater)?;
            params
        } else {
            Vec::new()
        };

        self.consume(TokenKind::Equal)?;

        let mut variants = vec![self.parse_variant()?];
        while self.match_token(&TokenKind::Pipe) {
            variants.push(self.parse_variant()?);
        }

        self.consume(TokenKind::Semicolon)?;

        Ok(TypeDef {
            name,
            type_params,
            variants,
            span: type_span,
        })
    }

    fn parse_variant(&mut self) -> Result<Variant, CompileError> {
        let name = self.parse_identifier()?;
        let span = Span::new(&self.current_filename, 0, 0, 0); // TODO: proper span

        let data = if self.match_token(&TokenKind::Less) {
            let ty = self.parse_type()?;
            self.consume(TokenKind::Greater)?;
            Some(ty)
        } else {
            None
        };

        Ok(Variant { name, data, span })
    }

    fn parse_extern_block(&mut self) -> Result<ExternBlock, CompileError> {
        let extern_span = self.consume(TokenKind::Extern)?.span.clone();
        self.consume(TokenKind::LeftBrace)?;

        let mut decls = Vec::new();
        while !self.check(&TokenKind::RightBrace) && !self.is_at_end() {
            decls.push(self.parse_extern_decl()?);
        }

        self.consume(TokenKind::RightBrace)?;

        Ok(ExternBlock {
            decls,
            span: extern_span,
        })
    }

    fn parse_extern_decl(&mut self) -> Result<ExternDecl, CompileError> {
        let fn_span = self.consume(TokenKind::Fn)?.span.clone();
        let name = self.parse_identifier()?;
        self.consume(TokenKind::LeftParen)?;
        let parameters = self.parse_parameters()?;
        self.consume(TokenKind::RightParen)?;

        let return_type = if self.match_token(&TokenKind::Arrow) {
            Some(self.parse_type()?)
        } else {
            None
        };

        self.consume(TokenKind::Semicolon)?;

        Ok(ExternDecl {
            name,
            parameters,
            return_type,
            span: fn_span,
        })
    }

    fn parse_block(&mut self) -> Result<Block, CompileError> {
        let block_span = self.consume(TokenKind::LeftBrace)?.span.clone();
        let mut statements = Vec::new();

        while !self.check(&TokenKind::RightBrace) && !self.is_at_end() {
            statements.push(self.parse_statement()?);
        }

        self.consume(TokenKind::RightBrace)?;

        Ok(Block {
            statements,
            span: block_span,
        })
    }

    fn parse_statement(&mut self) -> Result<Statement, CompileError> {
        match &self.current()?.kind {
            TokenKind::Let => self.parse_let_stmt().map(Statement::Let),
            TokenKind::Return => self.parse_return_stmt().map(Statement::Return),
            TokenKind::If => self.parse_if_stmt().map(Statement::If),
            TokenKind::Match => self.parse_match_stmt().map(Statement::Match),
            TokenKind::Loop => self.parse_loop_stmt().map(Statement::Loop),
            _ => {
                // Try to parse expression statement or assignment
                let expr = self.parse_expression()?;

                if self.match_token(&TokenKind::Equal) {
                    let value = self.parse_expression()?;
                    self.consume(TokenKind::Semicolon)?;
                    Ok(Statement::Assign(AssignStmt {
                        target: Box::new(expr),
                        value: Box::new(value),
                        span: Span::new(&self.current_filename, 0, 0, 0),
                    }))
                } else {
                    self.consume(TokenKind::Semicolon)?;
                    Ok(Statement::Expr(ExprStmt {
                        expr: Box::new(expr),
                        span: Span::new(&self.current_filename, 0, 0, 0),
                    }))
                }
            }
        }
    }

    fn parse_let_stmt(&mut self) -> Result<LetStmt, CompileError> {
        let let_span = self.consume(TokenKind::Let)?.span.clone();
        let name = self.parse_identifier()?;

        let ty = if self.match_token(&TokenKind::Colon) {
            Some(self.parse_type()?)
        } else {
            None
        };

        let value = if self.match_token(&TokenKind::Equal) {
            Some(Box::new(self.parse_expression()?))
        } else {
            None
        };

        self.consume(TokenKind::Semicolon)?;

        Ok(LetStmt {
            name,
            ty,
            value,
            span: let_span,
        })
    }

    fn parse_return_stmt(&mut self) -> Result<ReturnStmt, CompileError> {
        let ret_span = self.consume(TokenKind::Return)?.span.clone();

        let value = if self.check(&TokenKind::Semicolon) {
            None
        } else {
            Some(Box::new(self.parse_expression()?))
        };

        self.consume(TokenKind::Semicolon)?;

        Ok(ReturnStmt {
            value,
            span: ret_span,
        })
    }

    fn parse_if_stmt(&mut self) -> Result<IfStmt, CompileError> {
        let if_span = self.consume(TokenKind::If)?.span.clone();
        let condition = Box::new(self.parse_expression()?);
        let then_block = self.parse_block()?;

        let else_block = if self.match_token(&TokenKind::Else) {
            Some(self.parse_block()?)
        } else {
            None
        };

        Ok(IfStmt {
            condition,
            then_block,
            else_block,
            span: if_span,
        })
    }

    fn parse_match_stmt(&mut self) -> Result<MatchStmt, CompileError> {
        let match_span = self.consume(TokenKind::Match)?.span.clone();
        let expr = Box::new(self.parse_expression()?);
        self.consume(TokenKind::LeftBrace)?;

        let mut arms = Vec::new();
        while !self.check(&TokenKind::RightBrace) && !self.is_at_end() {
            let pattern = self.parse_pattern()?;
            self.consume(TokenKind::Arrow)?;
            let body = self.parse_block()?;
            arms.push(MatchArm {
                pattern,
                body,
                span: Span::new(&self.current_filename, 0, 0, 0),
            });
        }

        self.consume(TokenKind::RightBrace)?;

        Ok(MatchStmt {
            expr,
            arms,
            span: match_span,
        })
    }

    fn parse_loop_stmt(&mut self) -> Result<LoopStmt, CompileError> {
        let loop_span = self.consume(TokenKind::Loop)?.span.clone();
        let body = self.parse_block()?;

        Ok(LoopStmt {
            body,
            span: loop_span,
        })
    }

    fn parse_pattern(&mut self) -> Result<Pattern, CompileError> {
        if self.current()?.kind == TokenKind::Ident("_".to_string())
            || (self.position < self.tokens.len()
                && matches!(&self.tokens[self.position].kind, TokenKind::Ident(s) if s == "_"))
        {
            self.advance();
            return Ok(Pattern::Wildcard);
        }

        let name = self.parse_identifier()?;

        if self.match_token(&TokenKind::LeftParen) {
            let mut patterns = vec![self.parse_pattern()?];
            while self.match_token(&TokenKind::Comma) {
                patterns.push(self.parse_pattern()?);
            }
            self.consume(TokenKind::RightParen)?;
            Ok(Pattern::Constructor(name, patterns))
        } else {
            Ok(Pattern::Identifier(name))
        }
    }

    fn parse_expression(&mut self) -> Result<Expr, CompileError> {
        self.parse_or_expression()
    }

    fn parse_or_expression(&mut self) -> Result<Expr, CompileError> {
        let mut expr = self.parse_and_expression()?;

        while self.match_token(&TokenKind::Or) {
            let right = self.parse_and_expression()?;
            expr = Expr::BinaryOp(BinaryOp {
                left: Box::new(expr),
                op: "||".to_string(),
                right: Box::new(right),
                span: Span::new(&self.current_filename, 0, 0, 0),
            });
        }

        Ok(expr)
    }

    fn parse_and_expression(&mut self) -> Result<Expr, CompileError> {
        let mut expr = self.parse_equality_expression()?;

        while self.match_token(&TokenKind::And) {
            let right = self.parse_equality_expression()?;
            expr = Expr::BinaryOp(BinaryOp {
                left: Box::new(expr),
                op: "&&".to_string(),
                right: Box::new(right),
                span: Span::new(&self.current_filename, 0, 0, 0),
            });
        }

        Ok(expr)
    }

    fn parse_equality_expression(&mut self) -> Result<Expr, CompileError> {
        let mut expr = self.parse_relational_expression()?;

        loop {
            let op = if self.match_token(&TokenKind::EqualEqual) {
                "=="
            } else if self.match_token(&TokenKind::NotEqual) {
                "!="
            } else {
                break;
            };

            let right = self.parse_relational_expression()?;
            expr = Expr::BinaryOp(BinaryOp {
                left: Box::new(expr),
                op: op.to_string(),
                right: Box::new(right),
                span: Span::new(&self.current_filename, 0, 0, 0),
            });
        }

        Ok(expr)
    }

    fn parse_relational_expression(&mut self) -> Result<Expr, CompileError> {
        let mut expr = self.parse_additive_expression()?;

        loop {
            let op = if self.match_token(&TokenKind::Less) {
                "<"
            } else if self.match_token(&TokenKind::Greater) {
                ">"
            } else if self.match_token(&TokenKind::LessEqual) {
                "<="
            } else if self.match_token(&TokenKind::GreaterEqual) {
                ">="
            } else {
                break;
            };

            let right = self.parse_additive_expression()?;
            expr = Expr::BinaryOp(BinaryOp {
                left: Box::new(expr),
                op: op.to_string(),
                right: Box::new(right),
                span: Span::new(&self.current_filename, 0, 0, 0),
            });
        }

        Ok(expr)
    }

    fn parse_additive_expression(&mut self) -> Result<Expr, CompileError> {
        let mut expr = self.parse_multiplicative_expression()?;

        loop {
            let op = if self.match_token(&TokenKind::Plus) {
                "+"
            } else if self.match_token(&TokenKind::Minus) {
                "-"
            } else {
                break;
            };

            let right = self.parse_multiplicative_expression()?;
            expr = Expr::BinaryOp(BinaryOp {
                left: Box::new(expr),
                op: op.to_string(),
                right: Box::new(right),
                span: Span::new(&self.current_filename, 0, 0, 0),
            });
        }

        Ok(expr)
    }

    fn parse_multiplicative_expression(&mut self) -> Result<Expr, CompileError> {
        let mut expr = self.parse_unary_expression()?;

        loop {
            let op = if self.match_token(&TokenKind::Star) {
                "*"
            } else if self.match_token(&TokenKind::Slash) {
                "/"
            } else if self.match_token(&TokenKind::Percent) {
                "%"
            } else {
                break;
            };

            let right = self.parse_unary_expression()?;
            expr = Expr::BinaryOp(BinaryOp {
                left: Box::new(expr),
                op: op.to_string(),
                right: Box::new(right),
                span: Span::new(&self.current_filename, 0, 0, 0),
            });
        }

        Ok(expr)
    }

    fn parse_unary_expression(&mut self) -> Result<Expr, CompileError> {
        let op = if self.match_token(&TokenKind::Minus) {
            Some("-")
        } else if self.match_token(&TokenKind::Not) {
            Some("!")
        } else if self.match_token(&TokenKind::Star) {
            Some("*")
        } else if self.match_token(&TokenKind::Ampersand) {
            if self.match_token(&TokenKind::Mut) {
                Some("&mut")
            } else {
                Some("&")
            }
        } else {
            None
        };

        if let Some(op) = op {
            let expr = self.parse_unary_expression()?;
            Ok(Expr::UnaryOp(UnaryOp {
                op: op.to_string(),
                expr: Box::new(expr),
                span: Span::new(&self.current_filename, 0, 0, 0),
            }))
        } else {
            self.parse_postfix_expression()
        }
    }

    fn parse_postfix_expression(&mut self) -> Result<Expr, CompileError> {
        let mut expr = self.parse_primary_expression()?;

        loop {
            if self.match_token(&TokenKind::LeftParen) {
                let mut args = Vec::new();
                if !self.check(&TokenKind::RightParen) {
                    args.push(self.parse_expression()?);
                    while self.match_token(&TokenKind::Comma) {
                        args.push(self.parse_expression()?);
                    }
                }
                self.consume(TokenKind::RightParen)?;
                expr = Expr::FunctionCall(FunctionCall {
                    func: Box::new(expr),
                    args,
                    span: Span::new(&self.current_filename, 0, 0, 0),
                });
            } else if self.match_token(&TokenKind::Dot) {
                let field = self.parse_identifier()?;
                expr = Expr::FieldAccess(FieldAccess {
                    expr: Box::new(expr),
                    field,
                    span: Span::new(&self.current_filename, 0, 0, 0),
                });
            } else if self.match_token(&TokenKind::LeftBracket) {
                let index = self.parse_expression()?;
                self.consume(TokenKind::RightBracket)?;
                expr = Expr::Index(Index {
                    expr: Box::new(expr),
                    index: Box::new(index),
                    span: Span::new(&self.current_filename, 0, 0, 0),
                });
            } else {
                break;
            }
        }

        Ok(expr)
    }

    fn parse_primary_expression(&mut self) -> Result<Expr, CompileError> {
        let token = self.current()?.clone();
        match &token.kind {
            TokenKind::Number(n) => {
                let n = n.clone();
                self.advance();
                Ok(Expr::Literal(Literal::Number(n)))
            }
            TokenKind::String(s) => {
                let s = s.clone();
                self.advance();
                Ok(Expr::Literal(Literal::String(s)))
            }
            TokenKind::True => {
                self.advance();
                Ok(Expr::Literal(Literal::Bool(true)))
            }
            TokenKind::False => {
                self.advance();
                Ok(Expr::Literal(Literal::Bool(false)))
            }
            TokenKind::Ident(name) => {
                let name_clone = name.clone();
                let span = token.span.clone();
                self.advance();

                // Check if this is a constructor
                if self.check(&TokenKind::LeftParen)
                    && !matches!(self.current()?.kind, TokenKind::LeftParen)
                {
                    Ok(Expr::Variable(Variable {
                        name: name_clone,
                        span,
                    }))
                } else if self.match_token(&TokenKind::LeftParen) {
                    // Could be constructor call, but for now treat as function call
                    let mut args = Vec::new();
                    if !self.check(&TokenKind::RightParen) {
                        args.push(self.parse_expression()?);
                        while self.match_token(&TokenKind::Comma) {
                            args.push(self.parse_expression()?);
                        }
                    }
                    self.consume(TokenKind::RightParen)?;
                    Ok(Expr::Constructor(Constructor {
                        name: name_clone,
                        args,
                        span,
                    }))
                } else {
                    Ok(Expr::Variable(Variable {
                        name: name_clone,
                        span,
                    }))
                }
            }
            TokenKind::LeftParen => {
                self.advance();
                let expr = self.parse_expression()?;
                self.consume(TokenKind::RightParen)?;
                Ok(expr)
            }
            _ => Err(CompileError::new(
                ErrorKind::UnexpectedToken {
                    expected: "expression".to_string(),
                    found: format!("{:?}", token.kind),
                },
                token.span.clone(),
                "unexpected token in expression",
            )),
        }
    }

    // Helper methods

    fn parse_identifier(&mut self) -> Result<String, CompileError> {
        let token = self.current()?;
        match &token.kind {
            TokenKind::Ident(name) => {
                let name = name.clone();
                self.advance();
                Ok(name)
            }
            _ => Err(CompileError::new(
                ErrorKind::UnexpectedToken {
                    expected: "identifier".to_string(),
                    found: format!("{:?}", token.kind),
                },
                token.span.clone(),
                "expected identifier",
            )),
        }
    }

    fn current(&self) -> Result<&Token, CompileError> {
        if self.is_at_end() {
            Err(CompileError::new(
                ErrorKind::UnexpectedEndOfInput,
                Span::new(&self.current_filename, 0, 0, 0),
                "unexpected end of input",
            ))
        } else {
            Ok(&self.tokens[self.position])
        }
    }

    fn advance(&mut self) {
        if !self.is_at_end() {
            self.position += 1;
        }
    }

    fn check(&self, kind: &TokenKind) -> bool {
        if self.is_at_end() {
            return false;
        }
        std::mem::discriminant(&self.tokens[self.position].kind) == std::mem::discriminant(kind)
    }

    fn match_token(&mut self, kind: &TokenKind) -> bool {
        if self.check(kind) {
            self.advance();
            true
        } else {
            false
        }
    }

    fn consume(&mut self, kind: TokenKind) -> Result<Token, CompileError> {
        let token = self.current()?.clone();
        if std::mem::discriminant(&token.kind) == std::mem::discriminant(&kind) {
            self.advance();
            Ok(token)
        } else {
            Err(CompileError::new(
                ErrorKind::UnexpectedToken {
                    expected: format!("{:?}", kind),
                    found: format!("{:?}", token.kind),
                },
                token.span.clone(),
                &format!("expected {:?}", kind),
            ))
        }
    }

    fn is_at_end(&self) -> bool {
        self.position >= self.tokens.len() || self.tokens[self.position].kind == TokenKind::Eof
    }

    fn recover(&mut self) {
        // Simple error recovery: skip to next semicolon or closing brace
        while !self.is_at_end() {
            match &self.tokens[self.position].kind {
                TokenKind::Semicolon | TokenKind::RightBrace => {
                    self.advance();
                    break;
                }
                _ => self.advance(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler::lexer::Lexer;

    fn parse_string(input: &str) -> Result<Program, Vec<CompileError>> {
        let mut lexer = Lexer::new(input, "test.tuff");
        let tokens = lexer.tokenize();
        let mut parser = Parser::new(tokens, "test.tuff".to_string());
        parser.parse()
    }

    #[test]
    fn test_parse_simple_function() {
        let result = parse_string("fn main() { }");
        assert!(result.is_ok());
        let program = result.unwrap();
        assert_eq!(program.items.len(), 1);
    }

    #[test]
    fn test_parse_function_with_params() {
        let result = parse_string("fn add(x: i32, y: i32) -> i32 { x + y; }");
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_let_statement() {
        let result = parse_string("fn main() { let x = 42; }");
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_if_statement() {
        let result = parse_string("fn main() { if true { } }");
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_type_definition() {
        let result = parse_string("type Option<T> = Some<T> | None;");
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_expression() {
        let result = parse_string("fn main() { let x = 1 + 2 * 3; }");
        assert!(result.is_ok());
    }
}
