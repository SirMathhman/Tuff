use crate::ast::Expr;
use crate::errors::{Error, Span};
use crate::lexer::{SpannedToken, Token};

/// Parse a token stream into an expression tree.
///
/// Recursive descent with two precedence levels:
///
/// ```text
/// program  := let_stmt* expr
/// expr     := term (('+' | '-') term)*
/// term     := factor (('*') factor)*
/// factor   := Number | Ident | '-' factor | '(' expr ')' | block
/// block    := '{' let_stmt* expr '}'
/// let_stmt := 'let' Ident '=' expr ';'
/// ```
///
/// The parser owns all structural validation and reports real spans.
pub fn parse(tokens: &[SpannedToken]) -> Result<Expr, Error> {
    let mut parser = Parser { tokens, pos: 0 };
    let expr = parser.parse_let_seq()?;
    if parser.pos < parser.tokens.len() {
        let st = &parser.tokens[parser.pos];
        return Err(Error::UnexpectedToken {
            span: st.span,
            token: st.token.describe(),
        });
    }
    Ok(expr)
}

struct Parser<'a> {
    tokens: &'a [SpannedToken],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos).map(|st| &st.token)
    }

    /// A span pointing at the end of the token stream, for
    /// unexpected-end-of-input diagnostics.
    fn end_span(&self) -> Span {
        match self.tokens.last() {
            Some(st) => Span {
                start: st.span.end,
                end: st.span.end,
            },
            None => Span { start: 0, end: 0 },
        }
    }

    /// Consume the next token if it equals `expected`; otherwise report an
    /// error at the offending token's span.
    fn expect_token(&mut self, expected: &Token) -> Result<(), Error> {
        match self.peek() {
            Some(t) if t == expected => {
                self.pos += 1;
                Ok(())
            }
            Some(other) => Err(Error::UnexpectedToken {
                span: self.tokens[self.pos].span,
                token: other.describe(),
            }),
            None => Err(Error::UnexpectedEnd {
                span: self.end_span(),
            }),
        }
    }

    fn parse_expr(&mut self) -> Result<Expr, Error> {
        let mut lhs = self.parse_term()?;
        while matches!(self.peek(), Some(Token::Plus) | Some(Token::Minus)) {
            let op = match self.tokens[self.pos].token {
                Token::Plus => '+',
                Token::Minus => '-',
                _ => unreachable!(),
            };
            self.pos += 1;
            let rhs = self.parse_term()?;
            lhs = Expr::Binary {
                op,
                lhs: Box::new(lhs),
                rhs: Box::new(rhs),
            };
        }
        Ok(lhs)
    }

    fn parse_term(&mut self) -> Result<Expr, Error> {
        let mut lhs = self.parse_factor()?;
        while matches!(self.peek(), Some(Token::Star)) {
            self.pos += 1;
            let rhs = self.parse_factor()?;
            lhs = Expr::Binary {
                op: '*',
                lhs: Box::new(lhs),
                rhs: Box::new(rhs),
            };
        }
        Ok(lhs)
    }

    fn parse_factor(&mut self) -> Result<Expr, Error> {
        match self.peek() {
            Some(Token::Number(n)) => {
                let value = *n;
                self.pos += 1;
                Ok(Expr::Number(value))
            }
            Some(Token::Ident(name)) => {
                let name = name.clone();
                let span = self.tokens[self.pos].span;
                self.pos += 1;
                Ok(Expr::Ident { name, span })
            }
            Some(Token::Minus) => {
                // Unary minus: a negative factor.
                self.pos += 1;
                let operand = self.parse_factor()?;
                Ok(Expr::Unary {
                    op: '-',
                    operand: Box::new(operand),
                })
            }
            Some(Token::LParen) => {
                self.pos += 1;
                let inner = self.parse_expr()?;
                self.expect_token(&Token::RParen)?;
                Ok(inner)
            }
            Some(Token::LBrace) => self.parse_block(),
            Some(other) => Err(Error::UnexpectedToken {
                span: self.tokens[self.pos].span,
                token: other.describe(),
            }),
            None => Err(Error::UnexpectedEnd {
                span: self.end_span(),
            }),
        }
    }

    /// Parse a braced block: zero or more `let` statements followed by a
    /// tail expression. The block's value is the tail expression, with each
    /// `let` binding nested around it.
    fn parse_block(&mut self) -> Result<Expr, Error> {
        self.expect_token(&Token::LBrace)?;
        let body = self.parse_let_seq()?;
        self.expect_token(&Token::RBrace)?;
        Ok(body)
    }

    /// Parse zero or more `let` statements followed by a tail expression.
    /// Each `let` binding is nested around the tail, so later bindings can
    /// reference earlier ones.
    fn parse_let_seq(&mut self) -> Result<Expr, Error> {
        let mut lets: Vec<(String, Expr)> = Vec::new();
        while let Some(Token::Ident(name)) = self.peek() {
            if name != "let" {
                break;
            }
            self.pos += 1; // consume 'let'
            let name = match self.peek() {
                Some(Token::Ident(name)) => {
                    let n = name.clone();
                    self.pos += 1;
                    n
                }
                Some(other) => {
                    return Err(Error::UnexpectedToken {
                        span: self.tokens[self.pos].span,
                        token: other.describe(),
                    });
                }
                None => {
                    return Err(Error::UnexpectedEnd {
                        span: self.end_span(),
                    });
                }
            };
            self.expect_token(&Token::Eq)?;
            let value = self.parse_expr()?;
            self.expect_token(&Token::Semicolon)?;
            lets.push((name, value));
        }
        let tail = self.parse_expr()?;
        let mut body = tail;
        for (name, value) in lets.into_iter().rev() {
            body = Expr::Let {
                name,
                value: Box::new(value),
                body: Box::new(body),
            };
        }
        Ok(body)
    }
}
