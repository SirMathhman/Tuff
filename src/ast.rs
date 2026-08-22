use crate::Span;

/// A binary operator.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
}

/// An expression in the Tuff AST.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr {
    Num(i64, Span),
    Bin(BinOp, Box<Expr>, Box<Expr>, Span),
    Group(Box<Expr>, Span, Span),
    Ident(String, Span),
    Block(Vec<Stmt>, Span, Span),
}

/// A statement in a block.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Stmt {
    Let(String, bool, Box<Expr>, Span),
    Assign(String, Box<Expr>, Span),
    Expr(Box<Expr>),
}
