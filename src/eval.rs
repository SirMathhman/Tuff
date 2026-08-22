use std::collections::HashMap;

use crate::Span;
use crate::ast::{BinOp, Expr, Stmt};

/// A binding environment mapping variable names to (value, mutable),
/// with an optional parent scope for lexical scoping.
#[derive(Debug, Default, Clone)]
pub struct Env {
    vars: HashMap<String, (i64, bool)>,
    parent: Option<Box<Env>>,
}

impl Env {
    /// Create a child scope whose parent is the given environment.
    fn child(parent: Env) -> Env {
        Env {
            vars: HashMap::new(),
            parent: Some(Box::new(parent)),
        }
    }

    fn get(&self, name: &str) -> Option<i64> {
        if let Some((v, _)) = self.vars.get(name) {
            return Some(*v);
        }
        self.parent.as_deref().and_then(|p| p.get(name))
    }

    fn insert(&mut self, name: String, value: i64, mutable: bool) {
        self.vars.insert(name, (value, mutable));
    }

    fn set(&mut self, name: &str, value: i64, span: Span) -> Result<(), crate::TuffError> {
        if let Some((v, mutable)) = self.vars.get_mut(name) {
            if *mutable {
                *v = value;
                return Ok(());
            }
            return Err(crate::TuffError::Eval {
                span,
                message: format!("cannot assign to immutable variable '{name}'"),
            });
        }
        if let Some(parent) = &mut self.parent {
            return parent.set(name, value, span);
        }
        Err(crate::TuffError::Eval {
            span,
            message: format!("undefined variable '{name}'"),
        })
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
            let mut local = Env::child(env.clone());
            let mut last_value = None;
            for stmt in stmts {
                match stmt {
                    Stmt::Let(name, mutable, value, _) => {
                        let v = eval(value, &mut local)?;
                        local.insert(name.clone(), v, *mutable);
                    }
                    Stmt::Assign(name, value, span) => {
                        let v = eval(value, &mut local)?;
                        local.set(name, v, *span)?;
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
