use crate::Span;
use crate::ast::{BinOp, Expr, Stmt};
use crate::lexer::Token;

/// Parse a token stream into an expression AST.
pub fn parse(tokens: Vec<Token>) -> Result<Expr, crate::TuffError> {
    let mut parser = Parser { tokens, pos: 0 };
    if parser.tokens.is_empty() {
        return Err(crate::TuffError::Parse {
            span: Span { start: 0, end: 0 },
            message: "unexpected end of input".to_string(),
        });
    }
    let mut stmts = Vec::new();
    while let Some(token) = parser.peek() {
        stmts.push(match token {
            Token::Let(span) => parser.parse_let_stmt(span)?,
            Token::Ident(_, span) | Token::Star(span) if parser.is_assign_target() => {
                parser.parse_assign_stmt(span)?
            }
            Token::Ident(_, span) if parser.is_indexed_assign_target() => {
                parser.parse_indexed_assign_stmt(span)?
            }
            _ => Stmt::Expr(Box::new(parser.parse_expr()?)),
        });
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

    /// Whether the tokens at the current position begin an assignment
    /// statement: `name = …` or `*name = …`.
    fn is_assign_target(&self) -> bool {
        match self.tokens.get(self.pos) {
            Some(Token::Ident(_, _)) => matches!(self.tokens.get(self.pos + 1), Some(Token::Eq(_))),
            Some(Token::Star(_)) => matches!(
                (self.tokens.get(self.pos + 1), self.tokens.get(self.pos + 2)),
                (Some(Token::Ident(_, _)), Some(Token::Eq(_)))
            ),
            _ => false,
        }
    }

    /// Whether the tokens at the current position begin an indexed
    /// assignment statement: `name[expr] = …`.
    fn is_indexed_assign_target(&self) -> bool {
        match self.tokens.get(self.pos) {
            Some(Token::Ident(_, _)) => {
                matches!(self.tokens.get(self.pos + 1), Some(Token::LBracket(_)))
                    && self
                        .find_closing_bracket(self.pos + 1)
                        .map_or(false, |close| {
                            matches!(self.tokens.get(close + 1), Some(Token::Eq(_)))
                        })
            }
            _ => false,
        }
    }

    /// Find the index of the `]` matching the `[` at `open_pos`, or `None`
    /// if the brackets are unbalanced.
    fn find_closing_bracket(&self, open_pos: usize) -> Option<usize> {
        let mut depth = 0;
        let mut i = open_pos;
        while let Some(token) = self.tokens.get(i) {
            match token {
                Token::LBracket(_) => depth += 1,
                Token::RBracket(_) => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                _ => {}
            }
            i += 1;
        }
        None
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

    /// Parse a multiplicative expression (`*`).
    fn parse_term(&mut self) -> Result<Expr, crate::TuffError> {
        let mut left = self.parse_postfix()?;
        while let Some(Token::Star(span)) = self.peek() {
            self.pos += 1;
            let right = self.parse_postfix()?;
            left = Expr::Bin(BinOp::Mul, Box::new(left), Box::new(right), span);
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
                    return Err(crate::TuffError::Parse {
                        span: other.map(|t| t.span()).unwrap_or(span),
                        message: "expected ']'".to_string(),
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
            Some(Token::LParen(span)) => self.parse_group(span, ')', Token::RParen),
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
            Some(token) => Err(crate::TuffError::Parse {
                span: token.span(),
                message: "unexpected token".to_string(),
            }),
            None => Err(crate::TuffError::Parse {
                span: self
                    .tokens
                    .last()
                    .map(|t| t.span())
                    .unwrap_or(Span { start: 0, end: 0 }),
                message: "unexpected end of input".to_string(),
            }),
        }
    }

    /// Parse a parenthesized group.
    fn parse_group(
        &mut self,
        open: Span,
        close_char: char,
        make_close: fn(Span) -> Token,
    ) -> Result<Expr, crate::TuffError> {
        self.pos += 1;
        let expr = self.parse_expr()?;
        match self.peek() {
            Some(close) if close == make_close(close.span()) => {
                self.pos += 1;
                Ok(Expr::Group(Box::new(expr), open, close.span()))
            }
            other => Err(crate::TuffError::Parse {
                span: other.map(|t| t.span()).unwrap_or(open),
                message: format!("expected '{close_char}'"),
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
                        return Err(crate::TuffError::Parse {
                            span: other.map(|t| t.span()).unwrap_or(open),
                            message: "expected ',' or ']' in array".to_string(),
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
            _ => Err(crate::TuffError::Parse {
                span: open,
                message: "expected ']'".to_string(),
            }),
        }
    }

    /// Parse a braced block of statements.
    fn parse_block(&mut self, open: Span) -> Result<Expr, crate::TuffError> {
        self.pos += 1;
        let mut stmts = Vec::new();
        while !matches!(self.peek(), Some(Token::RBrace(_))) {
            match self.peek() {
                None => {
                    return Err(crate::TuffError::Parse {
                        span: open,
                        message: "expected '}'".to_string(),
                    });
                }
                Some(Token::Let(span)) => stmts.push(self.parse_let_stmt(span)?),
                Some(Token::Ident(_, span)) | Some(Token::Star(span))
                    if self.is_assign_target() =>
                {
                    stmts.push(self.parse_assign_stmt(span)?);
                }
                Some(Token::Ident(_, span)) if self.is_indexed_assign_target() => {
                    stmts.push(self.parse_indexed_assign_stmt(span)?);
                }
                Some(_) => {
                    let expr = self.parse_expr()?;
                    if matches!(self.peek(), Some(Token::Semi(_))) {
                        self.pos += 1;
                    }
                    stmts.push(Stmt::Expr(Box::new(expr)));
                }
            }
        }
        match self.peek() {
            Some(Token::RBrace(span)) => {
                self.pos += 1;
                Ok(Expr::Block(stmts, open, span))
            }
            _ => Err(crate::TuffError::Parse {
                span: open,
                message: "expected '}'".to_string(),
            }),
        }
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
                return Err(crate::TuffError::Parse {
                    span: other.map(|t| t.span()).unwrap_or(let_span),
                    message: "expected a variable name after 'let'".to_string(),
                });
            }
        };
        self.pos += 1;
        let value = self.parse_assign_value(name_span)?;
        Ok(Stmt::Let(name, mutable, value, let_span))
    }

    /// Parse an assignment statement (`name = expr ;` or `*name = expr ;`).
    fn parse_assign_stmt(&mut self, name_span: Span) -> Result<Stmt, crate::TuffError> {
        let target = self.parse_expr()?;
        let span = match &target {
            Expr::Ident(_, span) | Expr::Deref(_, span) => *span,
            _ => name_span,
        };
        let value = self.parse_assign_value(span)?;
        Ok(Stmt::Assign(Box::new(target), value, span))
    }

    /// Parse an indexed assignment statement (`name[expr] = expr ;`).
    fn parse_indexed_assign_stmt(&mut self, name_span: Span) -> Result<Stmt, crate::TuffError> {
        let (name, _) = match self.peek() {
            Some(Token::Ident(name, span)) => (name, span),
            other => {
                return Err(crate::TuffError::Parse {
                    span: other.map(|t| t.span()).unwrap_or(name_span),
                    message: "expected a variable name".to_string(),
                });
            }
        };
        self.pos += 1;
        let open = match self.peek() {
            Some(Token::LBracket(span)) => span,
            other => {
                return Err(crate::TuffError::Parse {
                    span: other.map(|t| t.span()).unwrap_or(name_span),
                    message: "expected '['".to_string(),
                });
            }
        };
        self.pos += 1;
        let index = self.parse_expr()?;
        let close = match self.peek() {
            Some(Token::RBracket(span)) => span,
            other => {
                return Err(crate::TuffError::Parse {
                    span: other.map(|t| t.span()).unwrap_or(open),
                    message: "expected ']'".to_string(),
                });
            }
        };
        self.pos += 1;
        let target = Expr::Index(
            Box::new(Expr::Ident(name, name_span)),
            Box::new(index),
            close,
        );
        let value = self.parse_assign_value(close)?;
        Ok(Stmt::Assign(Box::new(target), value, close))
    }

    /// Parse the `= expr ;` tail shared by let and assignment statements.
    fn parse_assign_value(&mut self, name_span: Span) -> Result<Box<Expr>, crate::TuffError> {
        match self.peek() {
            Some(Token::Eq(_)) => self.pos += 1,
            other => {
                return Err(crate::TuffError::Parse {
                    span: other.map(|t| t.span()).unwrap_or(name_span),
                    message: "expected '=' after variable name".to_string(),
                });
            }
        }
        let value = self.parse_expr()?;
        match self.peek() {
            Some(Token::Semi(_)) => self.pos += 1,
            other => {
                return Err(crate::TuffError::Parse {
                    span: other.map(|t| t.span()).unwrap_or(name_span),
                    message: "expected ';' after statement".to_string(),
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
            Err(crate::TuffError::Parse {
                span: Span { start: 0, end: 0 },
                message: "unexpected end of input".to_string(),
            })
        );
    }
}
