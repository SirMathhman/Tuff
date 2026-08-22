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
            Token::Ident(_, span)
                if matches!(parser.tokens.get(parser.pos + 1), Some(Token::Eq(_))) =>
            {
                parser.parse_assign_stmt(span)?
            }
            _ => Stmt::Expr(Box::new(parser.parse_expr()?)),
        });
    }
    let start = parser.tokens.first().map(|t| t.span()).unwrap().start;
    let end = parser.tokens.last().map(|t| t.span()).unwrap().end;
    Ok(Expr::Block(stmts, Span { start, end }, Span { start, end }))
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<Token> {
        self.tokens.get(self.pos).cloned()
    }

    fn parse_expr(&mut self) -> Result<Expr, crate::TuffError> {
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

    fn parse_term(&mut self) -> Result<Expr, crate::TuffError> {
        let mut left = self.parse_primary()?;
        while let Some(Token::Star(span)) = self.peek() {
            self.pos += 1;
            let right = self.parse_primary()?;
            left = Expr::Bin(BinOp::Mul, Box::new(left), Box::new(right), span);
        }
        Ok(left)
    }

    fn parse_primary(&mut self) -> Result<Expr, crate::TuffError> {
        match self.peek() {
            Some(Token::Num(value, span)) => {
                self.pos += 1;
                Ok(Expr::Num(value, span))
            }
            Some(Token::Ident(name, span)) => {
                self.pos += 1;
                Ok(Expr::Ident(name, span))
            }
            Some(Token::LParen(span)) => self.parse_group(span, ')', Token::RParen),
            Some(Token::LBrace(span)) => self.parse_block(span),
            Some(Token::Ref(span)) => {
                self.pos += 1;
                let inner = self.parse_primary()?;
                Ok(Expr::Ref(Box::new(inner), span))
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
                Some(Token::Ident(_, span))
                    if matches!(self.tokens.get(self.pos + 1), Some(Token::Eq(_))) =>
                {
                    stmts.push(self.parse_assign_stmt(span)?);
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

    fn parse_assign_stmt(&mut self, name_span: Span) -> Result<Stmt, crate::TuffError> {
        let name = match self.peek() {
            Some(Token::Ident(name, _)) => name,
            other => {
                return Err(crate::TuffError::Parse {
                    span: other.map(|t| t.span()).unwrap_or(name_span),
                    message: "expected a variable name before '='".to_string(),
                });
            }
        };
        self.pos += 1;
        let value = self.parse_assign_value(name_span)?;
        Ok(Stmt::Assign(name, value, name_span))
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
            | Token::Ref(span) => *span,
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
