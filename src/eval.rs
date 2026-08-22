use std::collections::HashMap;
use std::fmt;

use crate::Span;
use crate::ast::{BinOp, Expr, Stmt};
use crate::typeck::Type;

/// A runtime value produced by evaluation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    /// An integer.
    Int(i64),
    /// A boolean.
    Bool(bool),
    /// A shared reference to a variable.
    Ref(String),
    /// A mutable reference to a variable.
    MutRef(String),
    /// An array of values.
    Array(Vec<Value>),
}

impl Value {
    /// The static type of this value.
    pub fn type_of(&self) -> Type {
        match self {
            Value::Int(_) => Type::Int,
            Value::Bool(_) => Type::Bool,
            Value::Ref(_) => Type::Ref,
            Value::MutRef(_) => Type::MutRef,
            Value::Array(_) => Type::Array,
        }
    }
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Int(v) => write!(f, "{v}"),
            Value::Bool(v) => write!(f, "{v}"),
            Value::Ref(name) => write!(f, "&{name}"),
            Value::MutRef(name) => write!(f, "&mut {name}"),
            Value::Array(items) => {
                let inner: Vec<String> = items.iter().map(|v| v.to_string()).collect();
                write!(f, "[{}]", inner.join(", "))
            }
        }
    }
}

/// A binding environment: a stack of scopes, each mapping variable names
/// to (value, mutable). Outer scopes are shared, never cloned.
#[derive(Debug, Default)]
pub struct Env {
    /// The scope stack, innermost scope last.
    scopes: Vec<HashMap<String, (Value, bool)>>,
}

impl Env {
    /// Push a new empty scope.
    fn push_scope(&mut self) {
        self.scopes.push(HashMap::new());
    }

    /// Pop the innermost scope.
    fn pop_scope(&mut self) {
        self.scopes.pop();
    }

    /// Look up a binding by name, walking the scope chain from innermost out.
    fn get(&self, name: &str) -> Option<Value> {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(name).map(|(v, _)| v.clone()))
    }

    /// Bind a name in the innermost scope.
    fn insert(&mut self, name: String, value: Value, mutable: bool) {
        self.scopes
            .last_mut()
            .expect("a scope is always present")
            .insert(name, (value, mutable));
    }

    /// Assign a value to an existing mutable binding, walking the scope chain.
    fn set(&mut self, name: &str, value: Value, span: Span) -> Result<(), crate::TuffError> {
        for scope in self.scopes.iter_mut().rev() {
            if let Some((v, mutable)) = scope.get_mut(name) {
                if *mutable {
                    if !v.type_of().compatible(value.type_of()) {
                        return Err(crate::TuffError::TypeMismatch {
                            span,
                            found: value.type_of().name(),
                            expected: v.type_of().name(),
                            name: name.to_string(),
                        });
                    }
                    *v = value;
                    return Ok(());
                }
                return Err(crate::TuffError::ImmutableAssignment {
                    span,
                    name: name.to_string(),
                });
            }
        }
        Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.to_string(),
        })
    }

    /// Assign a value to an element of an array binding, walking the scope chain.
    fn set_index(
        &mut self,
        name: &str,
        index: i64,
        value: Value,
        span: Span,
    ) -> Result<(), crate::TuffError> {
        for scope in self.scopes.iter_mut().rev() {
            if let Some((v, mutable)) = scope.get_mut(name) {
                if !*mutable {
                    return Err(crate::TuffError::ImmutableAssignment {
                        span,
                        name: name.to_string(),
                    });
                }
                let Value::Array(items) = v else {
                    return Err(crate::TuffError::NotAnArray { span });
                };
                let i = index.try_into().unwrap_or(usize::MAX);
                let Some(current) = items.get(i) else {
                    return Err(crate::TuffError::IndexOutOfBounds {
                        span,
                        index,
                        len: items.len(),
                    });
                };
                if !current.type_of().compatible(value.type_of()) {
                    return Err(crate::TuffError::ElementTypeMismatch {
                        span,
                        found: value.type_of().name(),
                        expected: current.type_of().name(),
                    });
                }
                items[i] = value;
                return Ok(());
            }
        }
        Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.to_string(),
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
        Expr::Bool(value, _) => Ok(Value::Bool(*value)),
        Expr::Bin(op, left, right, span) => {
            let l = eval_expr(left, env)?;
            let r = eval_expr(right, env)?;
            eval_bin(*op, l, r, *span)
        }
        Expr::Group(inner, _, _) => eval_expr(inner, env),
        Expr::Array(elements, _) => {
            let mut items = Vec::with_capacity(elements.len());
            for element in elements {
                items.push(eval_expr(element, env)?);
            }
            Ok(Value::Array(items))
        }
        Expr::Index(base, index, span) => {
            let base = eval_expr(base, env)?;
            let index = eval_expr(index, env)?;
            eval_index(base, index, *span)
        }
        Expr::Ident(name, span) => {
            env.get(name)
                .ok_or_else(|| crate::TuffError::UndefinedVariable {
                    span: *span,
                    name: name.clone(),
                })
        }
        Expr::Ref(inner, mutable, span) => {
            let Expr::Ident(name, _) = inner.as_ref() else {
                return Err(crate::TuffError::ExpectedVariableName {
                    span: *span,
                    after: "&",
                });
            };
            if env.get(name).is_none() {
                return Err(crate::TuffError::UndefinedVariable {
                    span: *span,
                    name: name.clone(),
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
                return Err(crate::TuffError::ExpectedVariableName {
                    span: *span,
                    after: "*",
                });
            };
            let target = deref_target(name, env, *span)?;
            env.get(&target).ok_or(crate::TuffError::UndefinedVariable {
                span: *span,
                name: target,
            })
        }
        Expr::If(cond, then, otherwise, span) => {
            let Value::Bool(b) = eval_expr(cond, env)? else {
                return Err(crate::TuffError::ExpectedBooleanCondition { span: *span });
            };
            // Only the taken branch is evaluated; both were analyzed already.
            if b {
                eval_expr(then, env)
            } else {
                eval_expr(otherwise, env)
            }
        }
        Expr::Block(stmts, span, _) => exec_block(stmts, env, *span),
    }
}

/// Evaluate a binary operation on already-evaluated operands.
fn eval_bin(op: BinOp, l: Value, r: Value, span: Span) -> Result<Value, crate::TuffError> {
    let expected_integer = || crate::TuffError::ExpectedInteger { span };
    match op {
        BinOp::Eq => Ok(Value::Bool(l == r)),
        BinOp::Ne => Ok(Value::Bool(l != r)),
        BinOp::Lt | BinOp::LtEq | BinOp::Gt | BinOp::GtEq => {
            let Value::Int(l) = l else {
                return Err(expected_integer());
            };
            let Value::Int(r) = r else {
                return Err(expected_integer());
            };
            Ok(Value::Bool(match op {
                BinOp::Lt => l < r,
                BinOp::LtEq => l <= r,
                BinOp::Gt => l > r,
                BinOp::GtEq => l >= r,
                _ => unreachable!(),
            }))
        }
        BinOp::Add | BinOp::Sub | BinOp::Mul => {
            let Value::Int(l) = l else {
                return Err(expected_integer());
            };
            let Value::Int(r) = r else {
                return Err(expected_integer());
            };
            Ok(Value::Int(match op {
                BinOp::Add => l + r,
                BinOp::Sub => l - r,
                BinOp::Mul => l * r,
                _ => unreachable!(),
            }))
        }
    }
}

/// Evaluate an index expression on already-evaluated operands.
fn eval_index(base: Value, index: Value, span: Span) -> Result<Value, crate::TuffError> {
    let Value::Int(i) = index else {
        return Err(crate::TuffError::ExpectedIntegerIndex { span });
    };
    let Value::Array(items) = base else {
        return Err(crate::TuffError::NotAnArray { span });
    };
    items
        .get(i.try_into().unwrap_or(usize::MAX))
        .cloned()
        .ok_or(crate::TuffError::IndexOutOfBounds {
            span,
            index: i,
            len: items.len(),
        })
}

/// Resolve a reference variable to the name of the variable it points at.
fn deref_target(name: &str, env: &Env, span: Span) -> Result<String, crate::TuffError> {
    match env.get(name) {
        Some(Value::Ref(target)) | Some(Value::MutRef(target)) => Ok(target),
        Some(Value::Int(_)) | Some(Value::Bool(_)) | Some(Value::Array(_)) => {
            Err(crate::TuffError::NotAReference {
                span,
                name: name.to_string(),
            })
        }
        None => Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.to_string(),
        }),
    }
}

/// Execute a block's statements in a new scope, returning the value of
/// the last expression statement.
fn exec_block(stmts: &[Stmt], env: &mut Env, span: Span) -> Result<Value, crate::TuffError> {
    env.push_scope();
    let mut last_value = None;
    for stmt in stmts {
        match stmt {
            Stmt::Let(name, mutable, value, _) => {
                let v = eval_expr(value, env)?;
                env.insert(name.clone(), v, *mutable);
            }
            Stmt::Assign(target, value, span) => {
                let name = match target.as_ref() {
                    Expr::Ident(name, _) => name.clone(),
                    Expr::Deref(inner, _) => {
                        let Expr::Ident(name, _) = inner.as_ref() else {
                            return Err(crate::TuffError::ExpectedVariableName {
                                span: *span,
                                after: "*",
                            });
                        };
                        // Assign through the reference to the variable it points at.
                        if matches!(env.get(name), Some(Value::Ref(_))) {
                            return Err(crate::TuffError::CannotAssignThroughSharedReference {
                                span: *span,
                            });
                        }
                        deref_target(name, env, *span)?
                    }
                    Expr::Index(base, index, _) => {
                        let Expr::Ident(name, _) = base.as_ref() else {
                            return Err(crate::TuffError::InvalidAssignmentTarget { span: *span });
                        };
                        let Value::Int(i) = eval_expr(index, env)? else {
                            return Err(crate::TuffError::ExpectedIntegerIndex { span: *span });
                        };
                        let v = eval_expr(value, env)?;
                        env.set_index(name, i, v, *span)?;
                        last_value = Some(Value::Int(0));
                        continue;
                    }
                    _ => {
                        return Err(crate::TuffError::InvalidAssignmentTarget { span: *span });
                    }
                };
                let v = eval_expr(value, env)?;
                env.set(&name, v, *span)?;
                last_value = Some(Value::Int(0));
            }
            Stmt::Expr(e) => {
                last_value = Some(eval_expr(e, env)?);
            }
        }
    }
    env.pop_scope();
    // The block's value is the value of its last expression statement.
    last_value.ok_or(crate::TuffError::BlockHasNoValue { span })
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
