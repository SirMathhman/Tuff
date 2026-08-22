use std::collections::HashMap;
use std::fmt;

use crate::Span;
use crate::ast::{BinOp, Expr, Stmt};

/// A runtime value produced by evaluation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    /// An integer.
    Int(i64),
    /// A shared reference to a variable.
    Ref(String),
    /// A mutable reference to a variable.
    MutRef(String),
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Int(v) => write!(f, "{v}"),
            Value::Ref(name) => write!(f, "&{name}"),
            Value::MutRef(name) => write!(f, "&mut {name}"),
        }
    }
}

/// A binding environment mapping variable names to (value, mutable),
/// with an optional parent scope for lexical scoping.
#[derive(Debug, Default, Clone)]
pub struct Env {
    /// Bindings in this scope: name -> (value, mutable).
    vars: HashMap<String, (Value, bool)>,
    /// The enclosing scope, if any.
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

    /// Look up a binding by name, walking up the scope chain.
    fn get(&self, name: &str) -> Option<Value> {
        if let Some((v, _)) = self.vars.get(name) {
            return Some(v.clone());
        }
        self.parent.as_deref().and_then(|p| p.get(name))
    }

    /// Bind a name in this scope.
    fn insert(&mut self, name: String, value: Value, mutable: bool) {
        self.vars.insert(name, (value, mutable));
    }

    /// Assign a value to an existing mutable binding, walking up the scope chain.
    fn set(&mut self, name: &str, value: Value, span: Span) -> Result<(), crate::TuffError> {
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
pub fn eval(expr: &Expr, env: &mut Env) -> Result<Value, crate::TuffError> {
    match expr {
        Expr::Block(stmts, span, _) => exec_block(stmts, env, *span),
        _ => eval_expr(expr, env),
    }
}

/// Evaluate a non-block expression to its value in the given environment.
fn eval_expr(expr: &Expr, env: &mut Env) -> Result<Value, crate::TuffError> {
    match expr {
        Expr::Num(value, _) => Ok(Value::Int(*value)),
        Expr::Bool(value, _) => Ok(Value::Int(i64::from(*value))),
        Expr::Bin(op, left, right, span) => {
            let l = eval_expr(left, env)?;
            let r = eval_expr(right, env)?;
            let Value::Int(l) = l else {
                return Err(crate::TuffError::Eval {
                    span: *span,
                    message: "expected an integer".to_string(),
                });
            };
            let Value::Int(r) = r else {
                return Err(crate::TuffError::Eval {
                    span: *span,
                    message: "expected an integer".to_string(),
                });
            };
            Ok(Value::Int(match op {
                BinOp::Add => l + r,
                BinOp::Sub => l - r,
                BinOp::Mul => l * r,
                BinOp::Eq => i64::from(l == r),
            }))
        }
        Expr::Group(inner, _, _) => eval_expr(inner, env),
        Expr::Ident(name, span) => env.get(name).ok_or_else(|| crate::TuffError::Eval {
            span: *span,
            message: format!("undefined variable '{name}'"),
        }),
        Expr::Ref(inner, mutable, span) => {
            let Expr::Ident(name, _) = inner.as_ref() else {
                return Err(crate::TuffError::Eval {
                    span: *span,
                    message: "expected a variable name after '&'".to_string(),
                });
            };
            if env.get(name).is_none() {
                return Err(crate::TuffError::Eval {
                    span: *span,
                    message: format!("undefined variable '{name}'"),
                });
            }
            if *mutable {
                Ok(Value::MutRef(name.clone()))
            } else {
                Ok(Value::Ref(name.clone()))
            }
        }
        Expr::Deref(inner, span) => {
            let Expr::Ident(name, _) = inner.as_ref() else {
                return Err(crate::TuffError::Eval {
                    span: *span,
                    message: "expected a variable name after '*'".to_string(),
                });
            };
            match env.get(name) {
                Some(Value::Ref(target)) | Some(Value::MutRef(target)) => {
                    env.get(&target).ok_or_else(|| crate::TuffError::Eval {
                        span: *span,
                        message: format!("undefined variable '{target}'"),
                    })
                }
                Some(Value::Int(_)) => Err(crate::TuffError::Eval {
                    span: *span,
                    message: format!("'{name}' is not a reference"),
                }),
                None => Err(crate::TuffError::Eval {
                    span: *span,
                    message: format!("undefined variable '{name}'"),
                }),
            }
        }
        Expr::Block(stmts, span, _) => exec_block(stmts, env, *span),
    }
}

/// Execute a block's statements in a child scope, returning the value of
/// the last expression statement.
fn exec_block(stmts: &[Stmt], env: &mut Env, span: Span) -> Result<Value, crate::TuffError> {
    let mut local = Env::child(env.clone());
    let mut last_value = None;
    for stmt in stmts {
        match stmt {
            Stmt::Let(name, mutable, value, _) => {
                let v = eval_expr(value, &mut local)?;
                local.insert(name.clone(), v, *mutable);
            }
            Stmt::Assign(target, value, span) => {
                let name = match target.as_ref() {
                    Expr::Ident(name, _) => name.clone(),
                    Expr::Deref(inner, _) => match inner.as_ref() {
                        Expr::Ident(name, _) => name.clone(),
                        _ => {
                            return Err(crate::TuffError::Eval {
                                span: *span,
                                message: "expected a variable name after '*'".to_string(),
                            });
                        }
                    },
                    _ => {
                        return Err(crate::TuffError::Eval {
                            span: *span,
                            message: "expected a variable name or dereference as assignment target"
                                .to_string(),
                        });
                    }
                };
                let v = eval_expr(value, &mut local)?;
                local.set(&name, v, *span)?;
            }
            Stmt::Expr(e) => {
                last_value = Some(eval_expr(e, &mut local)?);
            }
        }
    }
    // The block's value is the value of its last expression statement.
    last_value.ok_or_else(|| crate::TuffError::Eval {
        span,
        message: "block has no value".to_string(),
    })
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
            Ok(Value::Int(5))
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
        assert_eq!(eval(&expr, &mut env), Ok(Value::Int(6)));
    }
}
