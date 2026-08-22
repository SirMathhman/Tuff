use crate::Span;

/// A binary operator.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinOp {
    /// Addition.
    Add,
    /// Subtraction.
    Sub,
    /// Multiplication.
    Mul,
    /// Equality comparison.
    Eq,
    /// Less-than comparison.
    Lt,
}

/// An expression in the Tuff AST.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr {
    /// An integer literal.
    Num(i64, Span),
    /// A boolean literal.
    Bool(bool, Span),
    /// A binary operation.
    Bin(BinOp, Box<Expr>, Box<Expr>, Span),
    /// A parenthesized or braced grouping.
    Group(Box<Expr>, Span, Span),
    /// A variable reference.
    Ident(String, Span),
    /// A reference (`&x` or `&mut x`); the bool is mutability.
    Ref(Box<Expr>, bool, Span),
    /// A dereference (`*x`).
    Deref(Box<Expr>, Span),
    /// A braced block of statements.
    Block(Vec<Stmt>, Span, Span),
}

/// A statement in a block.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Stmt {
    /// A `let` binding; the bool is mutability.
    Let(String, bool, Box<Expr>, Span),
    /// An assignment to a variable or dereference.
    Assign(Box<Expr>, Box<Expr>, Span),
    /// An expression statement.
    Expr(Box<Expr>),
}
