use crate::Span;
use crate::ast::{BinOp, Expr, Stmt};
use crate::lexer::Token;

/// Parse a token stream into an expression AST.
pub fn parse(tokens: Vec<Token>) -> Result<Expr, crate::TuffError> {
    let mut parser = Parser { tokens, pos: 0 };
    if parser.tokens.is_empty() {
        return Err(crate::TuffError::UnexpectedEndOfInput {
            span: Span { start: 0, end: 0 },
        });
    }
    let mut stmts = Vec::new();
    while parser.peek().is_some() {
        stmts.push(parser.parse_stmt()?);
    }
    let start = parser
        .tokens
        .first()
        .map(|t| t.span())
        .unwrap_or(Span { start: 0, end: 0 })
        .start;
    let end = parser
        .tokens
        .last()
        .map(|t| t.span())
        .unwrap_or(Span { start: 0, end: 0 })
        .end;
    Ok(Expr::Block(stmts, Span { start, end }, Span { start, end }))
}

/// A recursive-descent parser over a token stream.
struct Parser {
    /// The tokens being parsed.
    tokens: Vec<Token>,
    /// The index of the next token to consume.
    pos: usize,
}

impl Parser {
    /// The next token without consuming it.
    fn peek(&self) -> Option<Token> {
        self.tokens.get(self.pos).cloned()
    }

    /// Parse a statement: a `let` binding, a `break`, an assignment, or an
    /// expression.
    fn parse_stmt(&mut self) -> Result<Stmt, crate::TuffError> {
        if let Some(Token::Let(span)) = self.peek() {
            return self.parse_let_stmt(span);
        }
        if let Some(Token::Break(span)) = self.peek() {
            return self.parse_break_stmt(span);
        }
        let target = self.parse_expr()?;
        if matches!(self.peek(), Some(Token::Eq(_))) {
            let span = match &target {
                Expr::Ident(_, span) | Expr::Deref(_, span) | Expr::Index(_, _, span) => *span,
                _ => self
                    .peek()
                    .map(|t| t.span())
                    .unwrap_or(Span { start: 0, end: 0 }),
            };
            let value = self.parse_assign_value(span)?;
            Ok(Stmt::Assign(Box::new(target), value, span))
        } else {
            if matches!(self.peek(), Some(Token::Semi(_))) {
                self.pos += 1;
            }
            Ok(Stmt::Expr(Box::new(target)))
        }
    }

    /// Parse a comparison expression (`==`, `!=`, `<`, `<=`, `>`, `>=`).
    fn parse_expr(&mut self) -> Result<Expr, crate::TuffError> {
        let mut left = self.parse_additive()?;
        loop {
            let (op, span) = match self.peek() {
                Some(Token::EqEq(span)) => (BinOp::Eq, span),
                Some(Token::Ne(span)) => (BinOp::Ne, span),
                Some(Token::Lt(span)) => (BinOp::Lt, span),
                Some(Token::LtEq(span)) => (BinOp::LtEq, span),
                Some(Token::Gt(span)) => (BinOp::Gt, span),
                Some(Token::GtEq(span)) => (BinOp::GtEq, span),
                _ => break,
            };
            self.pos += 1;
            let right = self.parse_additive()?;
            left = Expr::Bin(op, Box::new(left), Box::new(right), span);
        }
        Ok(left)
    }

    /// Parse an additive expression (`+`, `-`).
    fn parse_additive(&mut self) -> Result<Expr, crate::TuffError> {
        let mut left = self.parse_term()?;
        loop {
            match self.peek() {
                Some(Token::Plus(span)) => {
                    self.pos += 1;
                    let right = self.parse_term()?;
                    left = Expr::Bin(BinOp::Add, Box::new(left), Box::new(right), span);
                }
                Some(Token::Minus(span)) => {
                    self.pos += 1;
                    let right = self.parse_term()?;
                    left = Expr::Bin(BinOp::Sub, Box::new(left), Box::new(right), span);
                }
                _ => break,
            }
        }
        Ok(left)
    }

    /// Parse a multiplicative expression (`*`, `/`).
    fn parse_term(&mut self) -> Result<Expr, crate::TuffError> {
        let mut left = self.parse_postfix()?;
        loop {
            match self.peek() {
                Some(Token::Star(span)) => {
                    self.pos += 1;
                    let right = self.parse_postfix()?;
                    left = Expr::Bin(BinOp::Mul, Box::new(left), Box::new(right), span);
                }
                Some(Token::Slash(span)) => {
                    self.pos += 1;
                    let right = self.parse_postfix()?;
                    left = Expr::Bin(BinOp::Div, Box::new(left), Box::new(right), span);
                }
                _ => break,
            }
        }
        Ok(left)
    }

    /// Parse a primary followed by any index expressions (`[…]`).
    fn parse_postfix(&mut self) -> Result<Expr, crate::TuffError> {
        let mut expr = self.parse_primary()?;
        while let Some(Token::LBracket(span)) = self.peek() {
            self.pos += 1;
            let index = self.parse_expr()?;
            match self.peek() {
                Some(Token::RBracket(close)) => {
                    self.pos += 1;
                    expr = Expr::Index(Box::new(expr), Box::new(index), close);
                }
                other => {
                    return Err(crate::TuffError::Expected {
                        span: other.map(|t| t.span()).unwrap_or(span),
                        expected: "]",
                    });
                }
            }
        }
        Ok(expr)
    }

    /// Parse a primary: literal, identifier, group, block, or reference.
    fn parse_primary(&mut self) -> Result<Expr, crate::TuffError> {
        match self.peek() {
            Some(Token::Num(value, span)) => {
                self.pos += 1;
                Ok(Expr::Num(value, span))
            }
            Some(Token::Bool(value, span)) => {
                self.pos += 1;
                Ok(Expr::Bool(value, span))
            }
            Some(Token::Ident(name, span)) => {
                self.pos += 1;
                Ok(Expr::Ident(name, span))
            }
            Some(Token::LParen(span)) => self.parse_group(span, ")", Token::RParen),
            Some(Token::LBrace(span)) => self.parse_block(span),
            Some(Token::LBracket(span)) => self.parse_array(span),
            Some(Token::Ref(span)) => {
                self.pos += 1;
                let inner = self.parse_primary()?;
                Ok(Expr::Ref(Box::new(inner), false, span))
            }
            Some(Token::MutRef(span)) => {
                self.pos += 1;
                let inner = self.parse_primary()?;
                Ok(Expr::Ref(Box::new(inner), true, span))
            }
            Some(Token::Star(span)) => {
                self.pos += 1;
                let inner = self.parse_primary()?;
                Ok(Expr::Deref(Box::new(inner), span))
            }
            Some(Token::If(span)) => self.parse_if(span),
            Some(Token::Loop(span)) => self.parse_loop(span),
            Some(token) => Err(crate::TuffError::UnexpectedToken { span: token.span() }),
            None => Err(crate::TuffError::UnexpectedEndOfInput {
                span: self
                    .tokens
                    .last()
                    .map(|t| t.span())
                    .unwrap_or(Span { start: 0, end: 0 }),
            }),
        }
    }

    /// Parse a parenthesized group.
    fn parse_group(
        &mut self,
        open: Span,
        close: &'static str,
        make_close: fn(Span) -> Token,
    ) -> Result<Expr, crate::TuffError> {
        self.pos += 1;
        let expr = self.parse_expr()?;
        match self.peek() {
            Some(close) if close == make_close(close.span()) => {
                self.pos += 1;
                Ok(Expr::Group(Box::new(expr), open, close.span()))
            }
            other => Err(crate::TuffError::Expected {
                span: other.map(|t| t.span()).unwrap_or(open),
                expected: close,
            }),
        }
    }

    /// Parse an array literal (`[expr, expr, …]`).
    fn parse_array(&mut self, open: Span) -> Result<Expr, crate::TuffError> {
        self.pos += 1;
        let mut elements = Vec::new();
        if matches!(self.peek(), Some(Token::RBracket(_))) {
            // Empty array.
        } else {
            loop {
                elements.push(self.parse_expr()?);
                match self.peek() {
                    Some(Token::Comma(_)) => self.pos += 1,
                    Some(Token::RBracket(close)) => {
                        self.pos += 1;
                        return Ok(Expr::Array(elements, close));
                    }
                    other => {
                        return Err(crate::TuffError::Expected {
                            span: other.map(|t| t.span()).unwrap_or(open),
                            expected: ", or ] in array",
                        });
                    }
                }
            }
        }
        match self.peek() {
            Some(Token::RBracket(close)) => {
                self.pos += 1;
                Ok(Expr::Array(elements, close))
            }
            _ => Err(crate::TuffError::Expected {
                span: open,
                expected: "]",
            }),
        }
    }

    /// Parse a braced block of statements.
    fn parse_block(&mut self, open: Span) -> Result<Expr, crate::TuffError> {
        self.pos += 1;
        let stmts = self.parse_block_stmts(open)?;
        match self.peek() {
            Some(Token::RBrace(span)) => {
                self.pos += 1;
                Ok(Expr::Block(stmts, open, span))
            }
            _ => Err(crate::TuffError::Expected {
                span: open,
                expected: "}",
            }),
        }
    }

    /// Parse the statements of a braced block, up to (not including) the
    /// closing brace.
    fn parse_block_stmts(&mut self, open: Span) -> Result<Vec<Stmt>, crate::TuffError> {
        let mut stmts = Vec::new();
        while !matches!(self.peek(), Some(Token::RBrace(_))) {
            if self.peek().is_none() {
                return Err(crate::TuffError::Expected {
                    span: open,
                    expected: "}",
                });
            }
            stmts.push(self.parse_stmt()?);
        }
        Ok(stmts)
    }

    /// Parse an `if cond then else` expression.
    fn parse_if(&mut self, if_span: Span) -> Result<Expr, crate::TuffError> {
        self.pos += 1;
        let cond = self.parse_expr()?;
        let then = self.parse_expr()?;
        match self.peek() {
            Some(Token::Else(_)) => {}
            other => {
                return Err(crate::TuffError::Expected {
                    span: other.map(|t| t.span()).unwrap_or(if_span),
                    expected: "else after if",
                });
            }
        }
        self.pos += 1;
        let otherwise = self.parse_expr()?;
        Ok(Expr::If(
            Box::new(cond),
            Box::new(then),
            Box::new(otherwise),
            if_span,
        ))
    }

    /// Parse a `loop { … }` expression.
    fn parse_loop(&mut self, loop_span: Span) -> Result<Expr, crate::TuffError> {
        self.pos += 1;
        match self.peek() {
            Some(Token::LBrace(_)) => self.pos += 1,
            other => {
                return Err(crate::TuffError::Expected {
                    span: other.map(|t| t.span()).unwrap_or(loop_span),
                    expected: "{ after loop",
                });
            }
        }
        let stmts = self.parse_block_stmts(loop_span)?;
        match self.peek() {
            Some(Token::RBrace(_)) => {
                self.pos += 1;
                Ok(Expr::Loop(stmts, loop_span))
            }
            _ => Err(crate::TuffError::Expected {
                span: loop_span,
                expected: "}",
            }),
        }
    }

    /// Parse a `break expr ;` statement.
    fn parse_break_stmt(&mut self, break_span: Span) -> Result<Stmt, crate::TuffError> {
        self.pos += 1;
        let value = self.parse_expr()?;
        match self.peek() {
            Some(Token::Semi(_)) => self.pos += 1,
            other => {
                return Err(crate::TuffError::Expected {
                    span: other.map(|t| t.span()).unwrap_or(break_span),
                    expected: "; after break value",
                });
            }
        }
        Ok(Stmt::Break(Box::new(value), break_span))
    }

    /// Parse a `let [mut] name = expr ;` statement.
    fn parse_let_stmt(&mut self, let_span: Span) -> Result<Stmt, crate::TuffError> {
        self.pos += 1;
        let mut mutable = false;
        if matches!(self.peek(), Some(Token::Mut(_))) {
            mutable = true;
            self.pos += 1;
        }
        let (name, name_span) = match self.peek() {
            Some(Token::Ident(name, span)) => (name, span),
            other => {
                return Err(crate::TuffError::Expected {
                    span: other.map(|t| t.span()).unwrap_or(let_span),
                    expected: "a variable name after let",
                });
            }
        };
        self.pos += 1;
        let value = self.parse_assign_value(name_span)?;
        Ok(Stmt::Let(name, mutable, value, let_span))
    }

    /// Parse the `= expr ;` tail shared by let and assignment statements.
    fn parse_assign_value(&mut self, name_span: Span) -> Result<Box<Expr>, crate::TuffError> {
        match self.peek() {
            Some(Token::Eq(_)) => self.pos += 1,
            other => {
                return Err(crate::TuffError::Expected {
                    span: other.map(|t| t.span()).unwrap_or(name_span),
                    expected: "= after variable name",
                });
            }
        }
        let value = self.parse_expr()?;
        match self.peek() {
            Some(Token::Semi(_)) => self.pos += 1,
            other => {
                return Err(crate::TuffError::Expected {
                    span: other.map(|t| t.span()).unwrap_or(name_span),
                    expected: "; after statement",
                });
            }
        }
        Ok(Box::new(value))
    }
}

impl Token {
    /// The source span of the token.
    fn span(&self) -> Span {
        match self {
            Token::Num(_, span)
            | Token::Plus(span)
            | Token::Minus(span)
            | Token::Star(span)
            | Token::Slash(span)
            | Token::LParen(span)
            | Token::RParen(span)
            | Token::LBrace(span)
            | Token::RBrace(span)
            | Token::Ident(_, span)
            | Token::Let(span)
            | Token::Mut(span)
            | Token::Eq(span)
            | Token::Semi(span)
            | Token::Ref(span)
            | Token::MutRef(span)
            | Token::EqEq(span)
            | Token::Ne(span)
            | Token::Lt(span)
            | Token::LtEq(span)
            | Token::Gt(span)
            | Token::GtEq(span)
            | Token::LBracket(span)
            | Token::RBracket(span)
            | Token::Comma(span)
            | Token::If(span)
            | Token::Else(span)
            | Token::Loop(span)
            | Token::Break(span)
            | Token::Bool(_, span) => *span,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::lex;

    #[test]
    fn parses_number() {
        assert_eq!(
            parse(lex("1").unwrap()),
            Ok(Expr::Block(
                vec![Stmt::Expr(Box::new(Expr::Num(
                    1,
                    Span { start: 0, end: 1 }
                )))],
                Span { start: 0, end: 1 },
                Span { start: 0, end: 1 }
            ))
        );
    }

    #[test]
    fn parses_precedence() {
        // 2 * 3 + 4 => Bin(Add, Bin(Mul, 2, 3), 4)
        let expr = parse(lex("2 * 3 + 4").unwrap()).unwrap();
        let Expr::Block(stmts, _, _) = &expr else {
            panic!("expected a top-level block");
        };
        let Stmt::Expr(e) = &stmts[0] else {
            panic!("expected an expression statement");
        };
        match e.as_ref() {
            Expr::Bin(BinOp::Add, left, right, _) => {
                assert!(matches!(&**left, Expr::Bin(BinOp::Mul, _, _, _)));
                assert!(matches!(&**right, Expr::Num(4, _)));
            }
            other => panic!("unexpected AST: {other:?}"),
        }
    }

    #[test]
    fn rejects_empty_input() {
        assert_eq!(
            parse(lex("").unwrap()),
            Err(crate::TuffError::UnexpectedEndOfInput {
                span: Span { start: 0, end: 0 },
            })
        );
    }
}
