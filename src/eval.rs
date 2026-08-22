use std::collections::HashMap;

use crate::ast::{BinOp, Expr, Stmt};

/// A binding environment mapping variable names to values.
#[derive(Debug, Default)]
pub struct Env {
    vars: HashMap<String, i64>,
}

impl Env {
    fn get(&self, name: &str) -> Option<i64> {
        self.vars.get(name).copied()
    }

    fn insert(&mut self, name: String, value: i64) {
        self.vars.insert(name, value);
    }
}

/// Evaluate an expression AST to its value in the given environment.
pub fn eval(expr: &Expr, env: &mut Env) -> Result<i64, crate::TuffError> {
    match expr {
        Expr::Num(value, _) => Ok(*value),
        Expr::Bin(op, left, right, _) => {
            let l = eval(left, env)?;
            let r = eval(right, env)?;
            Ok(match op {
                BinOp::Add => l + r,
                BinOp::Sub => l - r,
                BinOp::Mul => l * r,
            })
        }
        Expr::Group(inner, _, _) => eval(inner, env),
        Expr::Ident(name, span) => env.get(name).ok_or_else(|| crate::TuffError::Eval {
            span: *span,
            message: format!("undefined variable '{name}'"),
        }),
        Expr::Block(stmts, span, _) => {
            let mut local = Env::default();
            let mut last_value = None;
            for stmt in stmts {
                match stmt {
                    Stmt::Let(name, value, _) => {
                        let v = eval(value, &mut local)?;
                        local.insert(name.clone(), v);
                    }
                    Stmt::Expr(e) => {
                        last_value = Some(eval(e, &mut local)?);
                    }
                }
            }
            // The block's value is the value of its last expression statement.
            last_value.ok_or_else(|| crate::TuffError::Eval {
                span: *span,
                message: "block has no value".to_string(),
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
        let mut env = Env::default();
        assert_eq!(
            eval(&Expr::Num(5, Span { start: 0, end: 1 }), &mut env),
            Ok(5)
        );
    }

    #[test]
    fn evaluates_binary() {
        let expr = Expr::Bin(
            BinOp::Mul,
            Box::new(Expr::Num(2, Span { start: 0, end: 1 })),
            Box::new(Expr::Num(3, Span { start: 0, end: 1 })),
            Span { start: 0, end: 1 },
        );
        let mut env = Env::default();
        assert_eq!(eval(&expr, &mut env), Ok(6));
    }
}
