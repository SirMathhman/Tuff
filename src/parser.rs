use crate::ast::Expr;
use crate::errors::{Error, Span};
use crate::lexer::{SpannedToken, Token};

/// Parse a token stream into an expression tree.
///
/// Recursive descent with two precedence levels:
///
/// ```text
/// expr   := term (('+' | '-') term)*
/// term   := factor (('*') factor)*
/// factor := Number | '(' expr ')'
/// ```
///
/// The parser owns all structural validation and reports real spans.
pub fn parse(tokens: &[SpannedToken]) -> Result<Expr, Error> {
    let mut parser = Parser { tokens, pos: 0 };
    let expr = parser.parse_expr()?;
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
            Some(Token::Minus) => {
                // Unary minus: a negative factor.
                self.pos += 1;
                let operand = self.parse_factor()?;
                Ok(Expr::Unary {
                    op: '-',
                    operand: Box::new(operand),
                })
            }
            Some(Token::LParen) | Some(Token::LBrace) => {
                let closing = match self.tokens[self.pos].token {
                    Token::LParen => Token::RParen,
                    Token::LBrace => Token::RBrace,
                    _ => unreachable!(),
                };
                self.pos += 1;
                let inner = self.parse_expr()?;
                match self.peek() {
                    Some(t) if *t == closing => {
                        self.pos += 1;
                        Ok(inner)
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
            Some(other) => Err(Error::UnexpectedToken {
                span: self.tokens[self.pos].span,
                token: other.describe(),
            }),
            None => Err(Error::UnexpectedEnd {
                span: self.end_span(),
            }),
        }
    }
}
