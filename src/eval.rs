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
    Bool(bool),
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
        Expr::Bool(b) => Ok(Value::Bool(*b)),
        Expr::Ident { name, span } => env.lookup(name).ok_or_else(|| Error::UndefinedVariable {
            span: *span,
            name: name.clone(),
        }),
        Expr::Unary { op, span, operand } => eval_unary(op, *span, operand, env),
        Expr::Binary { op, span, lhs, rhs } => {
            let l = eval(lhs, env)?;
            let r = eval(rhs, env)?;
            eval_binary(op, *span, l, r)
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
                Value::Int(_) | Value::Bool(_) => {
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

/// Evaluate a unary expression: negation, logical not, reference, or deref.
fn eval_unary(
    op: &UnaryOp,
    span: Span,
    operand: &Expr,
    env: &mut Environment,
) -> Result<Value, Error> {
    match op {
        UnaryOp::Neg => {
            let v = eval(operand, env)?;
            Ok(Value::Int(-int_value(&v, span)?))
        }
        UnaryOp::Not => {
            let v = eval(operand, env)?;
            // Logical NOT: 1 if the operand is falsy, else 0.
            let t = match &v {
                Value::Int(n) => *n != 0,
                Value::Bool(b) => *b,
                Value::Ref { name, .. } => {
                    return Err(Error::UnexpectedToken {
                        span,
                        token: format!("reference to '{name}' used as boolean"),
                    });
                }
                Value::RefMut { name, .. } => {
                    return Err(Error::UnexpectedToken {
                        span,
                        token: format!("mutable reference to '{name}' used as boolean"),
                    });
                }
            };
            Ok(Value::Int(if t { 0 } else { 1 }))
        }
        UnaryOp::Ref => match operand {
            Expr::Ident { name, .. } => Ok(Value::Ref {
                name: name.clone(),
                span,
            }),
            _ => Err(Error::UnexpectedToken {
                span,
                token: "non-identifier operand of &".to_string(),
            }),
        },
        UnaryOp::RefMut => match operand {
            Expr::Ident { name, .. } => Ok(Value::RefMut {
                name: name.clone(),
                span,
            }),
            _ => Err(Error::UnexpectedToken {
                span,
                token: "non-identifier operand of &mut".to_string(),
            }),
        },
        UnaryOp::Deref => {
            let v = eval(operand, env)?;
            match v {
                Value::Ref { name, .. } | Value::RefMut { name, .. } => env
                    .lookup(&name)
                    .ok_or(Error::UndefinedVariable { span, name }),
                Value::Int(_) | Value::Bool(_) => Err(Error::UnexpectedToken {
                    span,
                    token: "non-reference operand of *".to_string(),
                }),
            }
        }
    }
}

/// Combine two evaluated operands with a binary operator.
fn eval_binary(op: &BinaryOp, span: Span, l: Value, r: Value) -> Result<Value, Error> {
    Ok(match op {
        BinaryOp::Add => Value::Int(int_value(&l, span)? + int_value(&r, span)?),
        BinaryOp::Sub => Value::Int(int_value(&l, span)? - int_value(&r, span)?),
        BinaryOp::Mul => Value::Int(int_value(&l, span)? * int_value(&r, span)?),
        BinaryOp::Eq => {
            // Equality: true if the operands are equal, else false.
            // Operands must share a type; mixing bool and int is an error.
            let eq = match (&l, &r) {
                (Value::Int(a), Value::Int(b)) => *a == *b,
                (Value::Bool(a), Value::Bool(b)) => *a == *b,
                _ => {
                    return Err(Error::TypeMismatch {
                        span,
                        expected: "both operands to be the same type".to_string(),
                        found: format!("{} and {}", type_name(&l), type_name(&r)),
                    });
                }
            };
            Value::Bool(eq)
        }
        BinaryOp::Lt => {
            // Less-than: true if the left operand is strictly less than the
            // right, else false. Operands must both be integers.
            let lt = match (&l, &r) {
                (Value::Int(a), Value::Int(b)) => a < b,
                _ => {
                    return Err(Error::TypeMismatch {
                        span,
                        expected: "both operands to be integers".to_string(),
                        found: format!("{} and {}", type_name(&l), type_name(&r)),
                    });
                }
            };
            Value::Bool(lt)
        }
        BinaryOp::Or => {
            // Logical OR: truthy is any non-zero value or true.
            Value::Int(if truthy(&l) || truthy(&r) { 1 } else { 0 })
        }
        BinaryOp::And => {
            // Logical AND: truthy is any non-zero value or true.
            Value::Int(if truthy(&l) && truthy(&r) { 1 } else { 0 })
        }
    })
}

/// Extract an `i64` from a `Value`, erroring if it is a bool or a reference.
fn int_value(v: &Value, span: Span) -> Result<i64, Error> {
    match v {
        Value::Int(n) => Ok(*n),
        Value::Bool(_) => Err(Error::TypeMismatch {
            span,
            expected: "an integer".to_string(),
            found: "a boolean".to_string(),
        }),
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

/// Truthiness: any non-zero integer or `true` is truthy.
fn truthy(v: &Value) -> bool {
    match v {
        Value::Int(n) => *n != 0,
        Value::Bool(b) => *b,
        Value::Ref { .. } | Value::RefMut { .. } => false,
    }
}

/// A short type name for diagnostics.
fn type_name(v: &Value) -> &'static str {
    match v {
        Value::Int(_) => "integer",
        Value::Bool(_) => "boolean",
        Value::Ref { .. } => "reference",
        Value::RefMut { .. } => "mutable reference",
    }
}
