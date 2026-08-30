use crate::ast::{BinaryOp, Expr, UnaryOp};
use crate::errors::Error;
use crate::lexer::{SpannedToken, Token};
use crate::span::Span;

mod stmt;

/// Parse a token stream into an expression tree.
///
/// Recursive descent with the following precedence levels (lowest to
/// highest): `||`, `&&`, `+`/`-`, `*`:
///
/// ```text
/// program  := stmt* or_expr
/// stmt     := let_stmt | assign_stmt | deref_assign_stmt
/// let_stmt := 'let' ['mut'] Ident '=' expr ';'
/// assign_stmt := Ident '=' expr ';'
/// deref_assign_stmt := '*' Ident '=' expr ';'
/// or_expr  := and_expr (('||') and_expr)*
/// and_expr := comparison_expr (('&&') comparison_expr)*
/// comparison_expr := expr (('==' | '<') expr)*
/// expr     := term (('+' | '-') term)*
/// term     := factor (('*') factor)*
/// factor   := Number | 'true' | 'false' | Ident | '-' factor | '!' factor | '&' ['mut'] factor | '*' factor | '(' or_expr ')' | block
/// block    := '{' stmt* or_expr '}'
/// ```
///
/// The parser owns all structural validation and reports real spans.
pub fn parse(tokens: &[SpannedToken]) -> Result<Expr, Error> {
    let mut parser = Parser { tokens, pos: 0 };
    let expr = parser.parse_stmt_seq()?;
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
            Some(other) => Err(Error::ExpectedToken {
                span: self.tokens[self.pos].span,
                expected: expected.describe(),
                found: other.describe(),
            }),
            None => Err(Error::UnexpectedEnd {
                span: self.end_span(),
            }),
        }
    }

    fn parse_or_expr(&mut self) -> Result<Expr, Error> {
        let mut lhs = self.parse_and_expr()?;
        while matches!(self.peek(), Some(Token::Or)) {
            let span = self.tokens[self.pos].span;
            self.pos += 1;
            let rhs = self.parse_and_expr()?;
            lhs = Expr::Binary {
                op: BinaryOp::Or,
                span,
                lhs: Box::new(lhs),
                rhs: Box::new(rhs),
            };
        }
        Ok(lhs)
    }

    fn parse_and_expr(&mut self) -> Result<Expr, Error> {
        let mut lhs = self.parse_comparison_expr()?;
        while matches!(self.peek(), Some(Token::And)) {
            let span = self.tokens[self.pos].span;
            self.pos += 1;
            let rhs = self.parse_comparison_expr()?;
            lhs = Expr::Binary {
                op: BinaryOp::And,
                span,
                lhs: Box::new(lhs),
                rhs: Box::new(rhs),
            };
        }
        Ok(lhs)
    }

    fn parse_comparison_expr(&mut self) -> Result<Expr, Error> {
        let mut lhs = self.parse_expr()?;
        while matches!(self.peek(), Some(Token::EqEq) | Some(Token::Lt)) {
            let op = match self.tokens[self.pos].token {
                Token::EqEq => BinaryOp::Eq,
                Token::Lt => BinaryOp::Lt,
                _ => unreachable!(),
            };
            let span = self.tokens[self.pos].span;
            self.pos += 1;
            let rhs = self.parse_expr()?;
            lhs = Expr::Binary {
                op,
                span,
                lhs: Box::new(lhs),
                rhs: Box::new(rhs),
            };
        }
        Ok(lhs)
    }

    fn parse_expr(&mut self) -> Result<Expr, Error> {
        let mut lhs = self.parse_term()?;
        while matches!(self.peek(), Some(Token::Plus) | Some(Token::Minus)) {
            let op = match self.tokens[self.pos].token {
                Token::Plus => BinaryOp::Add,
                Token::Minus => BinaryOp::Sub,
                _ => unreachable!(),
            };
            let span = self.tokens[self.pos].span;
            self.pos += 1;
            let rhs = self.parse_term()?;
            lhs = Expr::Binary {
                op,
                span,
                lhs: Box::new(lhs),
                rhs: Box::new(rhs),
            };
        }
        Ok(lhs)
    }

    fn parse_term(&mut self) -> Result<Expr, Error> {
        let mut lhs = self.parse_factor()?;
        while matches!(self.peek(), Some(Token::Star)) {
            let span = self.tokens[self.pos].span;
            self.pos += 1;
            let rhs = self.parse_factor()?;
            lhs = Expr::Binary {
                op: BinaryOp::Mul,
                span,
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
            Some(Token::True) => {
                self.pos += 1;
                Ok(Expr::Bool(true))
            }
            Some(Token::False) => {
                self.pos += 1;
                Ok(Expr::Bool(false))
            }
            Some(Token::Minus) | Some(Token::Not) | Some(Token::Amp) | Some(Token::Star) => {
                self.parse_unary_factor()
            }
            Some(Token::If) => self.parse_if_expr(),
            Some(Token::LParen) => {
                self.pos += 1;
                let inner = self.parse_or_expr()?;
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

    /// Parse a unary-prefix factor: `'-' factor`, `'!' factor`,
    /// `'&' ['mut'] factor`, or `'*' factor`.
    fn parse_unary_factor(&mut self) -> Result<Expr, Error> {
        let span = self.tokens[self.pos].span;
        let op = match self.peek() {
            Some(Token::Minus) => UnaryOp::Neg,
            Some(Token::Not) => UnaryOp::Not,
            Some(Token::Amp) => {
                self.pos += 1; // consume '&'
                let mutable = matches!(self.peek(), Some(Token::Mut));
                if mutable {
                    self.pos += 1; // consume 'mut'
                }
                return {
                    let operand = self.parse_factor()?;
                    Ok(Expr::Unary {
                        op: if mutable {
                            UnaryOp::RefMut
                        } else {
                            UnaryOp::Ref
                        },
                        span,
                        operand: Box::new(operand),
                    })
                };
            }
            Some(Token::Star) => UnaryOp::Deref,
            _ => unreachable!(),
        };
        self.pos += 1; // consume the operator token
        let operand = self.parse_factor()?;
        Ok(Expr::Unary {
            op,
            span,
            operand: Box::new(operand),
        })
    }

    /// Parse an `if` expression: `if cond then else els`.
    fn parse_if_expr(&mut self) -> Result<Expr, Error> {
        let span = self.tokens[self.pos].span;
        self.pos += 1; // consume 'if'
        let cond = self.parse_or_expr()?;
        let then = self.parse_or_expr()?;
        self.expect_token(&Token::Else)?;
        let els = self.parse_or_expr()?;
        Ok(Expr::If {
            span,
            cond: Box::new(cond),
            then: Box::new(then),
            els: Box::new(els),
        })
    }

    /// Parse a braced block: zero or more `let` statements followed by a
    /// tail expression. The block's value is the tail expression, with each
    /// `let` binding nested around it.
    fn parse_block(&mut self) -> Result<Expr, Error> {
        self.expect_token(&Token::LBrace)?;
        let body = self.parse_stmt_seq()?;
        self.expect_token(&Token::RBrace)?;
        Ok(body)
    }
}
