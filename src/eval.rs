use std::collections::HashMap;

use crate::ast::Expr;
use crate::errors::Error;

/// A stack of lexical scopes. Each scope maps variable names to their
/// integer values. Inner scopes shadow outer ones.
#[derive(Debug, Clone, Default)]
pub struct Environment {
    scopes: Vec<HashMap<String, i64>>,
}

impl Environment {
    pub fn new() -> Self {
        Self::default()
    }

    /// Look up a variable, searching innermost scope first.
    pub fn lookup(&self, name: &str) -> Option<i64> {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(name).copied())
    }

    /// Push a new scope and bind `name` to `value` in it.
    pub fn define(&mut self, name: String, value: i64) {
        self.scopes.push(HashMap::new());
        self.scopes.last_mut().unwrap().insert(name, value);
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
        Expr::Ident(name) => env
            .lookup(name)
            .map(Ok)
            .unwrap_or_else(|| Err(Error::UndefinedVariable { name: name.clone() })),
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
        Expr::Let { name, value, body } => {
            let v = eval(value, env)?;
            env.define(name.clone(), v);
            let result = eval(body, env)?;
            env.pop_scope();
            Ok(result)
        }
    }
}
