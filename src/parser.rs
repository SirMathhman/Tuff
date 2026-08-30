use crate::ast::Expr;
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
}

/// Parse a token stream into an expression tree.
///
/// Recursive descent with two precedence levels:
///
/// ```text
/// program  := stmt* expr
/// stmt     := let_stmt | assign_stmt
/// let_stmt := 'let' ['mut'] Ident '=' expr ';'
/// assign_stmt := Ident '=' expr ';'
/// expr     := term (('+' | '-') term)*
/// term     := factor (('*') factor)*
/// factor   := Number | Ident | '-' factor | '(' expr ')' | block
/// block    := '{' stmt* expr '}'
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

    /// Parse zero or more statements followed by a tail expression.
    /// Statements are `let` bindings or assignments, each nested around
    /// the tail so later statements can reference earlier bindings.
    fn parse_let_seq(&mut self) -> Result<Expr, Error> {
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
                    let value = self.parse_expr()?;
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
                        let value = self.parse_expr()?;
                        self.expect_token(&Token::Semicolon)?;
                        let span = self.tokens[saved].span;
                        stmts.push(Stmt::Assign { name, span, value });
                    } else {
                        // Not an assignment — this is the tail expression.
                        self.pos = saved;
                        break;
                    }
                }
                _ => break,
            }
        }
        let tail = self.parse_expr()?;
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
            };
        }
        Ok(body)
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
