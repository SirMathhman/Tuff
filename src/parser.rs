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

        let value = if matches!(self.current(), Token::Equal) {
            self.advance();
            Some(self.parse_expression()?)
        } else {
            None
        };

        if matches!(self.current(), Token::Semicolon) {
            self.advance();
        }

        Ok(Stmt::Let { name, value })
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

        self.expect(Token::LeftParen)?;
        let mut params = Vec::new();
        while !matches!(self.current(), Token::RightParen) {
            match self.current().clone() {
                Token::Identifier(p) => {
                    params.push(p);
                    self.advance();
                }
                _ => return Err("Expected parameter name".to_string()),
            }
            if matches!(self.current(), Token::Comma) {
                self.advance();
            }
        }
        self.expect(Token::RightParen)?;

        self.expect(Token::LeftBrace)?;
        let mut body = Vec::new();
        while !matches!(self.current(), Token::RightBrace) {
            body.push(self.parse_statement()?);
        }
        self.expect(Token::RightBrace)?;

        Ok(Stmt::Function { name, params, body })
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
        let mut parser = Parser::new("fn add(a, b) { return a + b; }");
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
