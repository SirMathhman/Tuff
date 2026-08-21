use crate::Error;

/// A value produced by an expression: an integer, a boolean, an
/// array, a tuple, or a reference to a binding. Booleans are
/// distinct from integers — `==` only yields `true` for two values
/// of the same kind — but arithmetic treats a boolean as its numeric
/// value (`true` is `1`, `false` is `0`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Value {
    Int(i64),
    Bool(bool),
    Array(Vec<Value>),
    Tuple(Vec<Value>),
    Ref { name: String, mutable: bool },
}

impl Value {
    /// Whether the value is truthy: non-zero for integers, the
    /// stored value for booleans, and `true` for arrays.
    pub(crate) fn is_truthy(&self) -> bool {
        match self {
            Value::Int(n) => *n != 0,
            Value::Bool(b) => *b,
            Value::Array(_) => true,
            Value::Tuple(_) => true,
            Value::Ref { .. } => true,
        }
    }

    /// The numeric value of the value (`true` is `1`, `false` is
    /// `0`).
    pub(crate) fn as_i64(&self) -> i64 {
        match self {
            Value::Int(n) => *n,
            Value::Bool(b) => i64::from(*b),
            Value::Array(_) => 0,
            Value::Tuple(_) => 0,
            Value::Ref { .. } => 0,
        }
    }

    /// The kind of the value, for error messages.
    pub(crate) fn kind(&self) -> &'static str {
        match self {
            Value::Int(_) => "integer",
            Value::Bool(_) => "boolean",
            Value::Array(_) => "array",
            Value::Tuple(_) => "tuple",
            Value::Ref { .. } => "reference",
        }
    }

    /// The element at `index`, if the value is an array and the index
    /// is in range.
    pub(crate) fn index(&self, index: i64, offset: usize) -> Result<Value, Error> {
        match self {
            Value::Array(items) => {
                if index < 0 || (index as usize) >= items.len() {
                    return Err(Error::IndexOutOfBounds { offset });
                }
                Ok(items[index as usize].clone())
            }
            _ => Err(Error::NotAnArray { offset }),
        }
    }

    /// The element at `field`, if the value is a tuple and the field
    /// is in range.
    pub(crate) fn field(&self, field: i64, offset: usize) -> Result<Value, Error> {
        match self {
            Value::Tuple(items) => {
                if field < 0 || (field as usize) >= items.len() {
                    return Err(Error::IndexOutOfBounds { offset });
                }
                Ok(items[field as usize].clone())
            }
            _ => Err(Error::NotATuple { offset }),
        }
    }

    /// The value the reference points to, looked up in the
    /// environment, innermost scope first.
    pub(crate) fn deref(
        &self,
        env: &[Vec<(String, bool, Value)>],
        offset: usize,
    ) -> Result<Value, Error> {
        match self {
            Value::Ref { name, .. } => {
                for scope in env.iter().rev() {
                    if let Some((_, _, value)) = scope.iter().find(|(n, _, _)| *n == *name) {
                        return Ok(value.clone());
                    }
                }
                Err(Error::UndefinedVariable {
                    offset,
                    name: name.clone(),
                })
            }
            _ => Err(Error::NotAReference { offset }),
        }
    }
}
