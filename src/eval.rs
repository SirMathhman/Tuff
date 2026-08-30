use crate::ast::{BinaryOp, Expr, UnaryOp};
use crate::errors::Error;
use crate::span::Span;
use crate::value::{int_value, truthy, type_name, Environment, Value};

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
