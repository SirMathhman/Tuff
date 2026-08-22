use crate::ast::{BinOp, Expr};

/// Evaluate an expression AST to its value.
pub fn eval(expr: &Expr) -> Result<i64, crate::TuffError> {
    match expr {
        Expr::Num(value, _) => Ok(*value),
        Expr::Bin(op, left, right, _) => {
            let l = eval(left)?;
            let r = eval(right)?;
            Ok(match op {
                BinOp::Add => l + r,
                BinOp::Sub => l - r,
                BinOp::Mul => l * r,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Span;
    use crate::ast::{BinOp, Expr};

    #[test]
    fn evaluates_number() {
        assert_eq!(eval(&Expr::Num(5, Span { start: 0, end: 1 })), Ok(5));
    }

    #[test]
    fn evaluates_binary() {
        let expr = Expr::Bin(
            BinOp::Mul,
            Box::new(Expr::Num(2, Span { start: 0, end: 1 })),
            Box::new(Expr::Num(3, Span { start: 0, end: 1 })),
            Span { start: 0, end: 1 },
        );
        assert_eq!(eval(&expr), Ok(6));
    }
}
