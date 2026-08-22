use std::collections::HashMap;
use std::fmt;

use crate::Span;
use crate::ast::BinOp;
use crate::typeck::{Type, TypedExpr, TypedStmt};

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

/// Evaluate a typed expression to its value in the given environment.
pub fn eval(expr: &TypedExpr, env: &mut Env) -> Result<Value, crate::TuffError> {
    match expr {
        TypedExpr::Block(stmts, _, span) => exec_block(stmts, env, *span),
        _ => eval_expr(expr, env),
    }
}

/// Evaluate a non-block typed expression to its value in the given environment.
fn eval_expr(expr: &TypedExpr, env: &mut Env) -> Result<Value, crate::TuffError> {
    match expr {
        TypedExpr::Num(value, _) => Ok(Value::Int(*value)),
        TypedExpr::Bool(value, _) => Ok(Value::Bool(*value)),
        TypedExpr::Bin(op, left, right, _, span) => {
            let l = eval_expr(left, env)?;
            let r = eval_expr(right, env)?;
            eval_bin(*op, l, r, *span)
        }
        TypedExpr::Group(inner, _) => eval_expr(inner, env),
        TypedExpr::Array(elements, _) => {
            let mut items = Vec::with_capacity(elements.len());
            for element in elements {
                items.push(eval_expr(element, env)?);
            }
            Ok(Value::Array(items))
        }
        TypedExpr::Index(base, index, span) => {
            let base = eval_expr(base, env)?;
            let index = eval_expr(index, env)?;
            eval_index(base, index, *span)
        }
        TypedExpr::Ident(name, _, span) => env
            .get(name)
            .ok_or_else(|| crate::TuffError::UndefinedVariable {
                span: *span,
                name: name.clone(),
            }),
        TypedExpr::Ref(name, mutable, _) => {
            if *mutable {
                Ok(Value::MutRef(name.clone()))
            } else {
                Ok(Value::Ref(name.clone()))
            }
        }
        TypedExpr::Deref(target, _, span) => env
            .get(target)
            .ok_or_else(|| crate::TuffError::UndefinedVariable {
                span: *span,
                name: target.clone(),
            }),
        TypedExpr::If(cond, then, otherwise, _, _) => {
            let Value::Bool(b) = eval_expr(cond, env)? else {
                unreachable!("the analysis pass guarantees a boolean condition");
            };
            // Only the taken branch is evaluated; both were analyzed already.
            if b {
                eval_expr(then, env)
            } else {
                eval_expr(otherwise, env)
            }
        }
        TypedExpr::Block(stmts, _, span) => exec_block(stmts, env, *span),
    }
}

/// Evaluate a binary operation on already-evaluated operands. The analysis
/// pass guarantees the operand types, so each arm is compiler-proven
/// exhaustive and no `unreachable!` is needed.
fn eval_bin(op: BinOp, l: Value, r: Value, span: Span) -> Result<Value, crate::TuffError> {
    match op {
        BinOp::Eq => Ok(Value::Bool(l == r)),
        BinOp::Ne => Ok(Value::Bool(l != r)),
        BinOp::Lt | BinOp::LtEq | BinOp::Gt | BinOp::GtEq => {
            let Value::Int(l) = l else {
                return Err(crate::TuffError::ExpectedInteger { span });
            };
            let Value::Int(r) = r else {
                return Err(crate::TuffError::ExpectedInteger { span });
            };
            Ok(Value::Bool(match op {
                BinOp::Lt => l < r,
                BinOp::LtEq => l <= r,
                BinOp::Gt => l > r,
                BinOp::GtEq => l >= r,
                _ => unreachable!("comparison operators only"),
            }))
        }
        BinOp::Add | BinOp::Sub | BinOp::Mul => {
            let Value::Int(l) = l else {
                return Err(crate::TuffError::ExpectedInteger { span });
            };
            let Value::Int(r) = r else {
                return Err(crate::TuffError::ExpectedInteger { span });
            };
            Ok(Value::Int(match op {
                BinOp::Add => l + r,
                BinOp::Sub => l - r,
                BinOp::Mul => l * r,
                _ => unreachable!("arithmetic operators only"),
            }))
        }
    }
}

/// Evaluate an index expression on already-evaluated operands. The analysis
/// pass guarantees the base is an array and the index an integer; only the
/// bounds are checked dynamically.
fn eval_index(base: Value, index: Value, span: Span) -> Result<Value, crate::TuffError> {
    let Value::Int(i) = index else {
        unreachable!("the analysis pass guarantees an integer index");
    };
    let Value::Array(items) = base else {
        unreachable!("the analysis pass guarantees an array base");
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

/// Execute a block's typed statements in a new scope, returning the value of
/// the last expression statement.
fn exec_block(stmts: &[TypedStmt], env: &mut Env, span: Span) -> Result<Value, crate::TuffError> {
    env.push_scope();
    let mut last_value = None;
    for stmt in stmts {
        match stmt {
            TypedStmt::Let(name, mutable, value, _, _) => {
                let v = eval_expr(value, env)?;
                env.insert(name.clone(), v, *mutable);
            }
            TypedStmt::Assign(target, value, span) => {
                let v = eval_expr(value, env)?;
                match target.as_ref() {
                    TypedExpr::Ident(name, _, _) => {
                        env.set(name, v, *span)?;
                    }
                    TypedExpr::Deref(target, _, _) => {
                        // Assign through the reference to the variable it points at.
                        env.set(target, v, *span)?;
                    }
                    TypedExpr::Index(base, index, _) => {
                        let TypedExpr::Ident(name, _, _) = base.as_ref() else {
                            unreachable!("the analysis pass guarantees an array base");
                        };
                        let Value::Int(i) = eval_expr(index, env)? else {
                            unreachable!("the analysis pass guarantees an integer index");
                        };
                        env.set_index(name, i, v, *span)?;
                    }
                    _ => unreachable!("the analysis pass guarantees a valid assignment target"),
                }
                last_value = Some(Value::Int(0));
            }
            TypedStmt::Expr(e) => {
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
    use crate::ast::BinOp;
    use crate::typeck::Type;

    fn span() -> Span {
        Span { start: 0, end: 1 }
    }

    #[test]
    fn evaluates_number() {
        let mut env = Env::default();
        assert_eq!(
            eval(&TypedExpr::Num(5, span()), &mut env),
            Ok(Value::Int(5))
        );
    }

    #[test]
    fn evaluates_binary() {
        let expr = TypedExpr::Bin(
            BinOp::Mul,
            Box::new(TypedExpr::Num(2, span())),
            Box::new(TypedExpr::Num(3, span())),
            Type::Int,
            span(),
        );
        let mut env = Env::default();
        assert_eq!(eval(&expr, &mut env), Ok(Value::Int(6)));
    }
}
