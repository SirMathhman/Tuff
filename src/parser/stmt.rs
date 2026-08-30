use crate::ast::Expr;
use crate::errors::Error;
use crate::lexer::Token;
use crate::span::Span;

use super::Parser;

/// A parsed statement (before nesting into the expression tree).
pub(super) enum Stmt {
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
    Block {
        span: Span,
        value: Expr,
    },
}

impl<'a> Parser<'a> {
    /// Parse zero or more statements followed by a tail expression.
    /// Statements are `let` bindings or assignments, each nested around
    /// the tail so later statements can reference earlier bindings.
    pub(super) fn parse_stmt_seq(&mut self) -> Result<Expr, Error> {
        let stmts = self.parse_stmts()?;
        let tail = self.parse_or_expr()?;
        Ok(Self::build_body(stmts, tail))
    }

    /// Parse zero or more statements, returning them in order.
    pub(super) fn parse_stmts(&mut self) -> Result<Vec<Stmt>, Error> {
        let mut stmts: Vec<Stmt> = Vec::new();
        loop {
            match self.peek() {
                Some(Token::Let) => {
                    stmts.push(self.parse_let_stmt()?);
                }
                Some(Token::Ident(_)) => match self.parse_assign_stmt()? {
                    Some(stmt) => stmts.push(stmt),
                    None => break,
                },
                Some(Token::Star) if self.is_deref_assign() => {
                    stmts.push(self.parse_deref_assign_stmt()?);
                }
                Some(Token::If) => {
                    let span = self.tokens[self.pos].span;
                    let value = self.parse_if_expr()?;
                    stmts.push(Stmt::Block { span, value });
                }
                Some(Token::LBrace) => {
                    // A block is a statement only if it is not followed by a
                    // binary operator or ')', which would make it an operand
                    // of a larger expression (i.e. the tail).
                    let saved = self.pos;
                    let value = self.parse_block()?;
                    if matches!(
                        self.peek(),
                        Some(Token::Plus)
                            | Some(Token::Minus)
                            | Some(Token::Star)
                            | Some(Token::EqEq)
                            | Some(Token::Lt)
                            | Some(Token::Or)
                            | Some(Token::And)
                            | Some(Token::RParen)
                    ) {
                        // Block is an expression, not a statement.
                        self.pos = saved;
                        break;
                    }
                    let span = self.tokens[saved].span;
                    stmts.push(Stmt::Block { span, value });
                }
                _ => break,
            }
        }
        Ok(stmts)
    }

    /// Parse a `let [mut] Ident = or_expr ;` statement.
    fn parse_let_stmt(&mut self) -> Result<Stmt, Error> {
        self.pos += 1; // consume 'let'
        let mutable = matches!(self.peek(), Some(Token::Mut));
        if mutable {
            self.pos += 1; // consume 'mut'
        }
        let name = self.parse_ident_name()?;
        self.expect_token(&Token::Eq)?;
        let value = self.parse_or_expr()?;
        self.expect_token(&Token::Semicolon)?;
        Ok(Stmt::Let {
            name,
            mutable,
            value,
        })
    }

    /// Parse an assignment statement: `Ident '=' expr ';'` or
    /// compound `Ident '+=' expr ';'`. Returns `None` (and restores
    /// position) when the lookahead shows a tail expression instead.
    fn parse_assign_stmt(&mut self) -> Result<Option<Stmt>, Error> {
        let saved = self.pos;
        let name = self.parse_ident_name()?;
        if matches!(self.peek(), Some(Token::Eq)) {
            self.pos += 1; // consume '='
            let value = self.parse_or_expr()?;
            self.expect_token(&Token::Semicolon)?;
            let span = self.tokens[saved].span;
            Ok(Some(Stmt::Assign { name, span, value }))
        } else if matches!(self.peek(), Some(Token::PlusEq)) {
            // Desugar 'x += expr' to 'x = x + expr'
            self.pos += 1; // consume '+='
            let rhs = self.parse_or_expr()?;
            self.expect_token(&Token::Semicolon)?;
            let span = self.tokens[saved].span;
            let lhs = Expr::Ident {
                name: name.clone(),
                span,
            };
            let value = Expr::Binary {
                op: crate::ast::BinaryOp::Add,
                span,
                lhs: Box::new(lhs),
                rhs: Box::new(rhs),
            };
            Ok(Some(Stmt::Assign { name, span, value }))
        } else {
            // Not an assignment — this is the tail expression.
            self.pos = saved;
            Ok(None)
        }
    }

    /// Parse a deref-assign statement: `'*' Ident '=' expr ';'`.
    fn parse_deref_assign_stmt(&mut self) -> Result<Stmt, Error> {
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
        Ok(Stmt::DerefAssign {
            target,
            span,
            value,
        })
    }

    /// Fold parsed statements (in reverse) around the tail expression to
    /// build the nested `Expr` tree.
    pub(super) fn build_body(stmts: Vec<Stmt>, tail: Expr) -> Expr {
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
                Stmt::Block { span, value } => Expr::Block {
                    span,
                    value: Box::new(value),
                    body: Box::new(body),
                },
            };
        }
        body
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
