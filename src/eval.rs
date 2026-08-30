use std::collections::HashMap;

use crate::ast::Expr;
use crate::errors::Error;
use crate::span::Span;

/// A variable binding with its value and mutability flag.
#[derive(Debug, Clone)]
struct Binding {
    value: i64,
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
    pub fn lookup(&self, name: &str) -> Option<i64> {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(name).map(|b| b.value))
    }

    /// Assign a new value to an existing variable. Returns an error if the
    /// variable is not found or is immutable.
    pub fn assign(&mut self, name: &str, span: Span, value: i64) -> Result<(), Error> {
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
    pub fn define(&mut self, name: String, value: i64, mutable: bool) {
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
pub fn eval(expr: &Expr, env: &mut Environment) -> Result<i64, Error> {
    match expr {
        Expr::Number(n) => Ok(*n),
        Expr::Ident { name, span } => env.lookup(name).map(Ok).unwrap_or_else(|| {
            Err(Error::UndefinedVariable {
                span: *span,
                name: name.clone(),
            })
        }),
        Expr::Unary { op, operand } => {
            let v = eval(operand, env)?;
            Ok(match op {
                '-' => -v,
                _ => unreachable!(),
            })
        }
        Expr::Binary { op, lhs, rhs } => {
            let l = eval(lhs, env)?;
            let r = eval(rhs, env)?;
            Ok(match op {
                '+' => l + r,
                '-' => l - r,
                '*' => l * r,
                _ => unreachable!(),
            })
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
    }
}
