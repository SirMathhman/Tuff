use crate::ast::{BinaryOp, Expr, UnaryOp};
use crate::errors::Error;
use crate::lexer::{SpannedToken, Token};
use crate::span::Span;

/// A parsed statement (before nesting into the expression tree).
enum Stmt {
    Let {
        name: String,
        mutable: bool,
        value: Expr,
    },
    Assign {
        name: String,
        span: Span,
        value: Expr,
    },
    DerefAssign {
        target: Expr,
        span: Span,
        value: Expr,
    },
}

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
/// and_expr := expr (('&&') expr)*
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
            Some(other) => Err(Error::UnexpectedToken {
                span: self.tokens[self.pos].span,
                token: other.describe(),
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
        let mut lhs = self.parse_expr()?;
        while matches!(self.peek(), Some(Token::And)) {
            let span = self.tokens[self.pos].span;
            self.pos += 1;
            let rhs = self.parse_expr()?;
            lhs = Expr::Binary {
                op: BinaryOp::And,
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
                // The boolean literal `true` is the integer 1.
                self.pos += 1;
                Ok(Expr::Number(1))
            }
            Some(Token::False) => {
                // The boolean literal `false` is the integer 0.
                self.pos += 1;
                Ok(Expr::Number(0))
            }
            Some(Token::Minus) => {
                // Unary minus: a negative factor.
                let span = self.tokens[self.pos].span;
                self.pos += 1;
                let operand = self.parse_factor()?;
                Ok(Expr::Unary {
                    op: UnaryOp::Neg,
                    span,
                    operand: Box::new(operand),
                })
            }
            Some(Token::Not) => {
                // Unary logical not: 1 if the operand is zero, else 0.
                let span = self.tokens[self.pos].span;
                self.pos += 1;
                let operand = self.parse_factor()?;
                Ok(Expr::Unary {
                    op: UnaryOp::Not,
                    span,
                    operand: Box::new(operand),
                })
            }
            Some(Token::Amp) => {
                // Unary reference: take a (mutable) reference to an identifier.
                let span = self.tokens[self.pos].span;
                self.pos += 1;
                let mutable = matches!(self.peek(), Some(Token::Mut));
                if mutable {
                    self.pos += 1; // consume 'mut'
                }
                let operand = self.parse_factor()?;
                let op = if mutable {
                    UnaryOp::RefMut
                } else {
                    UnaryOp::Ref
                };
                Ok(Expr::Unary {
                    op,
                    span,
                    operand: Box::new(operand),
                })
            }
            Some(Token::Star) => {
                // Unary dereference: dereference a reference.
                let span = self.tokens[self.pos].span;
                self.pos += 1;
                let operand = self.parse_factor()?;
                Ok(Expr::Unary {
                    op: UnaryOp::Deref,
                    span,
                    operand: Box::new(operand),
                })
            }
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

    /// Parse a braced block: zero or more `let` statements followed by a
    /// tail expression. The block's value is the tail expression, with each
    /// `let` binding nested around it.
    fn parse_block(&mut self) -> Result<Expr, Error> {
        self.expect_token(&Token::LBrace)?;
        let body = self.parse_stmt_seq()?;
        self.expect_token(&Token::RBrace)?;
        Ok(body)
    }

    /// Parse zero or more statements followed by a tail expression.
    /// Statements are `let` bindings or assignments, each nested around
    /// the tail so later statements can reference earlier bindings.
    fn parse_stmt_seq(&mut self) -> Result<Expr, Error> {
        let mut stmts: Vec<Stmt> = Vec::new();
        loop {
            match self.peek() {
                Some(Token::Let) => {
                    self.pos += 1; // consume 'let'
                    let mutable = matches!(self.peek(), Some(Token::Mut));
                    if mutable {
                        self.pos += 1; // consume 'mut'
                    }
                    let name = self.parse_ident_name()?;
                    self.expect_token(&Token::Eq)?;
                    let value = self.parse_or_expr()?;
                    self.expect_token(&Token::Semicolon)?;
                    stmts.push(Stmt::Let {
                        name,
                        mutable,
                        value,
                    });
                }
                Some(Token::Ident(_)) => {
                    // Could be an assignment statement: Ident '=' expr ';'
                    let saved = self.pos;
                    let name = self.parse_ident_name()?;
                    if matches!(self.peek(), Some(Token::Eq)) {
                        self.pos += 1; // consume '='
                        let value = self.parse_or_expr()?;
                        self.expect_token(&Token::Semicolon)?;
                        let span = self.tokens[saved].span;
                        stmts.push(Stmt::Assign { name, span, value });
                    } else {
                        // Not an assignment — this is the tail expression.
                        self.pos = saved;
                        break;
                    }
                }
                Some(Token::Star) if self.is_deref_assign() => {
                    // Deref-assign statement: '*Ident' '=' expr ';'
                    let span = self.tokens[self.pos].span;
                    self.pos += 1; // consume '*'
                    let name = self.parse_ident_name()?;
                    let ident_span = self.tokens[self.pos - 1].span;
                    self.expect_token(&Token::Eq)?;
                    let value = self.parse_or_expr()?;
                    self.expect_token(&Token::Semicolon)?;
                    let target = Expr::Ident {
                        name,
                        span: ident_span,
                    };
                    stmts.push(Stmt::DerefAssign {
                        target,
                        span,
                        value,
                    });
                }
                _ => break,
            }
        }
        let tail = self.parse_or_expr()?;
        let mut body = tail;
        for stmt in stmts.into_iter().rev() {
            body = match stmt {
                Stmt::Let {
                    name,
                    mutable,
                    value,
                } => Expr::Let {
                    name,
                    mutable,
                    value: Box::new(value),
                    body: Box::new(body),
                },
                Stmt::Assign { name, span, value } => Expr::Assign {
                    name,
                    span,
                    value: Box::new(value),
                    body: Box::new(body),
                },
                Stmt::DerefAssign {
                    target,
                    span,
                    value,
                } => Expr::DerefAssign {
                    target: Box::new(target),
                    span,
                    value: Box::new(value),
                    body: Box::new(body),
                },
            };
        }
        Ok(body)
    }

    /// True if the current position starts a deref-assign statement:
    /// `'*' Ident '='`.
    fn is_deref_assign(&self) -> bool {
        matches!(self.peek(), Some(Token::Star))
            && matches!(
                self.tokens.get(self.pos + 1).map(|t| &t.token),
                Some(Token::Ident(_))
            )
            && matches!(
                self.tokens.get(self.pos + 2).map(|t| &t.token),
                Some(Token::Eq)
            )
    }

    /// Parse an identifier token, returning its name.
    fn parse_ident_name(&mut self) -> Result<String, Error> {
        match self.peek() {
            Some(Token::Ident(name)) => {
                let n = name.clone();
                self.pos += 1;
                Ok(n)
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
