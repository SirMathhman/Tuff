use std::collections::HashMap;

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

/// Extract an `i64` from a `Value`, erroring if it is a bool or a reference.
pub fn int_value(v: &Value, span: Span) -> Result<i64, Error> {
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
pub fn truthy(v: &Value) -> bool {
    match v {
        Value::Int(n) => *n != 0,
        Value::Bool(b) => *b,
        Value::Ref { .. } | Value::RefMut { .. } => false,
    }
}

/// A short type name for diagnostics.
pub fn type_name(v: &Value) -> &'static str {
    match v {
        Value::Int(_) => "integer",
        Value::Bool(_) => "boolean",
        Value::Ref { .. } => "reference",
        Value::RefMut { .. } => "mutable reference",
    }
}
