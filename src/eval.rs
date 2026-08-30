use std::collections::HashMap;

use crate::ast::{BinaryOp, Expr, UnaryOp};
use crate::errors::Error;
use crate::span::Span;

/// A runtime value: either an integer or a reference to a variable.
///
/// Reference variants carry the span of the `&` / `&mut` expression that
/// created them, so diagnostics can point at the real source location.
#[derive(Debug, Clone)]
pub enum Value {
    Int(i64),
    Ref { name: String, span: Span },
    RefMut { name: String, span: Span },
}

/// A variable binding with its value and mutability flag.
#[derive(Debug, Clone)]
struct Binding {
    value: Value,
    mutable: bool,
}

/// A stack of lexical scopes. Each scope maps variable names to their
/// bindings. Inner scopes shadow outer ones.
#[derive(Debug, Clone, Default)]
pub struct Environment {
    scopes: Vec<HashMap<String, Binding>>,
}

impl Environment {
    pub fn new() -> Self {
        Self::default()
    }

    /// Look up a variable's value, searching innermost scope first.
    pub fn lookup(&self, name: &str) -> Option<Value> {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(name).map(|b| b.value.clone()))
    }

    /// Assign a new value to an existing variable. Returns an error if the
    /// variable is not found or is immutable.
    pub fn assign(&mut self, name: &str, span: Span, value: Value) -> Result<(), Error> {
        for scope in self.scopes.iter_mut().rev() {
            if let Some(binding) = scope.get_mut(name) {
                if !binding.mutable {
                    return Err(Error::ImmutableVariable {
                        span,
                        name: name.to_string(),
                    });
                }
                binding.value = value;
                return Ok(());
            }
        }
        Err(Error::UndefinedVariable {
            span,
            name: name.to_string(),
        })
    }

    /// Push a new scope and bind `name` to `value` in it.
    pub fn define(&mut self, name: String, value: Value, mutable: bool) {
        self.scopes.push(HashMap::new());
        self.scopes
            .last_mut()
            .unwrap()
            .insert(name, Binding { value, mutable });
    }

    /// Pop the most recent scope.
    pub fn pop_scope(&mut self) {
        self.scopes.pop();
    }
}

/// Evaluate an expression tree in the given environment.
///
/// The tree shape already encodes precedence and grouping (the parser
/// built it that way), so evaluation is a straightforward recursive walk.
/// `Let` nodes bind their value in a fresh scope for the duration of the
/// body.
pub fn eval(expr: &Expr, env: &mut Environment) -> Result<Value, Error> {
    match expr {
        Expr::Number(n) => Ok(Value::Int(*n)),
        Expr::Ident { name, span } => env.lookup(name).ok_or_else(|| Error::UndefinedVariable {
            span: *span,
            name: name.clone(),
        }),
        Expr::Unary { op, span, operand } => match op {
            UnaryOp::Neg => {
                let v = eval(operand, env)?;
                Ok(Value::Int(-int_value(&v, *span)?))
            }
            UnaryOp::Ref => match operand.as_ref() {
                Expr::Ident { name, .. } => Ok(Value::Ref {
                    name: name.clone(),
                    span: *span,
                }),
                _ => Err(Error::UnexpectedToken {
                    span: *span,
                    token: "non-identifier operand of &".to_string(),
                }),
            },
            UnaryOp::RefMut => match operand.as_ref() {
                Expr::Ident { name, .. } => Ok(Value::RefMut {
                    name: name.clone(),
                    span: *span,
                }),
                _ => Err(Error::UnexpectedToken {
                    span: *span,
                    token: "non-identifier operand of &mut".to_string(),
                }),
            },
            UnaryOp::Deref => {
                let v = eval(operand, env)?;
                match v {
                    Value::Ref { name, .. } | Value::RefMut { name, .. } => env
                        .lookup(&name)
                        .ok_or(Error::UndefinedVariable { span: *span, name }),
                    Value::Int(_) => Err(Error::UnexpectedToken {
                        span: *span,
                        token: "non-reference operand of *".to_string(),
                    }),
                }
            }
        },
        Expr::Binary { op, span, lhs, rhs } => {
            let l = int_value(&eval(lhs, env)?, *span)?;
            let r = int_value(&eval(rhs, env)?, *span)?;
            Ok(Value::Int(match op {
                BinaryOp::Add => l + r,
                BinaryOp::Sub => l - r,
                BinaryOp::Mul => l * r,
                BinaryOp::Or => {
                    // Logical OR: truthy is any non-zero value.
                    if l != 0 || r != 0 { 1 } else { 0 }
                }
            }))
        }
        Expr::Let {
            name,
            mutable,
            value,
            body,
        } => {
            let v = eval(value, env)?;
            env.define(name.clone(), v, *mutable);
            let result = eval(body, env)?;
            env.pop_scope();
            Ok(result)
        }
        Expr::Assign {
            name,
            span,
            value,
            body,
        } => {
            let v = eval(value, env)?;
            env.assign(name, *span, v)?;
            eval(body, env)
        }
        Expr::DerefAssign {
            target,
            span,
            value,
            body,
        } => {
            let name = match eval(target, env)? {
                Value::Ref { name, .. } | Value::RefMut { name, .. } => name,
                Value::Int(_) => {
                    return Err(Error::UnexpectedToken {
                        span: *span,
                        token: "non-reference target of * =".to_string(),
                    });
                }
            };
            let v = eval(value, env)?;
            env.assign(&name, *span, v)?;
            eval(body, env)
        }
    }
}

/// Extract an `i64` from a `Value`, erroring if it is a reference.
fn int_value(v: &Value, span: Span) -> Result<i64, Error> {
    match v {
        Value::Int(n) => Ok(*n),
        Value::Ref { name, .. } => Err(Error::UnexpectedToken {
            span,
            token: format!("reference to '{name}' used as integer"),
        }),
        Value::RefMut { name, .. } => Err(Error::UnexpectedToken {
            span,
            token: format!("mutable reference to '{name}' used as integer"),
        }),
    }
}
