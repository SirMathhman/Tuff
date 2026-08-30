use crate::span::Span;

/// A unary operator.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnaryOp {
    Neg,
    Ref,
    Deref,
}

/// A binary operator.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinaryOp {
    Add,
    Sub,
    Mul,
}

/// An arithmetic expression.
///
/// `Number` is a leaf; `Binary` combines two sub-expressions with an
/// operator. The tree shape encodes precedence and grouping, so evaluation
/// is a straightforward walk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr {
    Number(i64),
    Ident {
        name: String,
        span: Span,
    },
    Unary {
        op: UnaryOp,
        span: Span,
        operand: Box<Expr>,
    },
    Binary {
        op: BinaryOp,
        span: Span,
        lhs: Box<Expr>,
        rhs: Box<Expr>,
    },
    Let {
        name: String,
        mutable: bool,
        value: Box<Expr>,
        body: Box<Expr>,
    },
    Assign {
        name: String,
        span: Span,
        value: Box<Expr>,
        body: Box<Expr>,
    },
}
