/// An arithmetic expression.
///
/// `Number` is a leaf; `Binary` combines two sub-expressions with an
/// operator. The tree shape encodes precedence and grouping, so evaluation
/// is a straightforward walk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr {
    Number(i64),
    Binary {
        op: char,
        lhs: Box<Expr>,
        rhs: Box<Expr>,
    },
}
