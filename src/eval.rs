use crate::ast::Expr;

/// Evaluate an expression tree.
///
/// The tree shape already encodes precedence and grouping (the parser
/// built it that way), so evaluation is a straightforward recursive walk.
pub fn eval(expr: &Expr) -> i64 {
    match expr {
        Expr::Number(n) => *n,
        Expr::Unary { op, operand } => {
            let v = eval(operand);
            match op {
                '-' => -v,
                _ => unreachable!(),
            }
        }
        Expr::Binary { op, lhs, rhs } => {
            let l = eval(lhs);
            let r = eval(rhs);
            match op {
                '+' => l + r,
                '-' => l - r,
                '*' => l * r,
                _ => unreachable!(),
            }
        }
    }
}
