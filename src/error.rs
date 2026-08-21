use std::fmt;

/// Error returned by [`crate::interpret`] when the input cannot be
/// interpreted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The program contains no statements.
    EmptyProgram {
        /// Byte offset of the end of the input.
        offset: usize,
    },
    /// A block's last statement was a `let` binding instead of an
    /// expression.
    BlockMustEndWithExpression {
        /// Byte offset of the block's closing delimiter.
        offset: usize,
    },
    /// A `let` binding was not followed by `=`.
    ExpectedEquals {
        /// Byte offset of the character where `=` was expected.
        offset: usize,
    },
    /// A character cannot start an expression here.
    UnexpectedToken {
        /// Byte offset of the offending character.
        offset: usize,
        /// The offending character, if any.
        found: Option<u8>,
    },
    /// A closing delimiter was not found where expected.
    ExpectedClosingDelimiter {
        /// Byte offset of the character where the delimiter was
        /// expected.
        offset: usize,
        /// The expected closing delimiter.
        expected: u8,
    },
    /// The result of an operation does not fit in an `i64`.
    Overflow {
        /// Byte offset of the operator that caused the overflow.
        offset: usize,
    },
    /// A variable was referenced that was not bound by an enclosing `let`.
    UndefinedVariable {
        /// Byte offset of the variable name.
        offset: usize,
        /// The name of the undefined variable.
        name: String,
    },
    /// An assignment targeted a binding that was not declared `mut`.
    AssignmentToImmutable {
        /// Byte offset of the variable name.
        offset: usize,
        /// The name of the immutable variable.
        name: String,
    },
    /// An `if` expression was not followed by an `else` branch.
    ExpectedElse {
        /// Byte offset of the character where `else` was expected.
        offset: usize,
    },
    /// An assignment's value has a different kind than the binding.
    TypeMismatch {
        /// Byte offset of the assigned value.
        offset: usize,
        /// The name of the binding being assigned to.
        name: String,
        /// The kind of the binding's current value.
        expected: String,
        /// The kind of the assigned value.
        found: String,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::EmptyProgram { offset } => {
                write!(
                    f,
                    "empty program at offset {offset}: the input must contain at least one statement"
                )
            }
            Error::BlockMustEndWithExpression { offset } => {
                write!(
                    f,
                    "block must end with an expression at offset {offset}: move the trailing `let` binding before the final expression"
                )
            }
            Error::ExpectedEquals { offset } => {
                write!(
                    f,
                    "expected '=' at offset {offset}: a `let` binding needs the form `let name = expr`"
                )
            }
            Error::UnexpectedToken { offset, found } => match found {
                Some(c) => write!(
                    f,
                    "unexpected character '{}' at offset {offset}: only digits, lowercase identifiers, `true`, `false`, `(`, `{{`, and operators are supported",
                    char::from(*c)
                ),
                None => write!(
                    f,
                    "unexpected end of input at offset {offset}: an expression was expected here"
                ),
            },
            Error::ExpectedClosingDelimiter { offset, expected } => {
                write!(
                    f,
                    "expected '{}' at offset {offset}: close the group or block that was opened earlier",
                    char::from(*expected)
                )
            }
            Error::Overflow { offset } => {
                write!(
                    f,
                    "arithmetic overflow at offset {offset}: the result does not fit in an i64; reduce the operands"
                )
            }
            Error::UndefinedVariable { offset, name } => {
                write!(
                    f,
                    "undefined variable '{name}' at offset {offset}: bind it with a `let` before this point"
                )
            }
            Error::AssignmentToImmutable { offset, name } => {
                write!(
                    f,
                    "cannot assign to '{name}' at offset {offset}: it was not declared `mut`; declare it with `let mut`"
                )
            }
            Error::ExpectedElse { offset } => {
                write!(
                    f,
                    "expected 'else' at offset {offset}: an `if` expression needs an `else` branch"
                )
            }
            Error::TypeMismatch {
                offset,
                name,
                expected,
                found,
            } => {
                write!(
                    f,
                    "type mismatch at offset {offset}: cannot assign a {found} to '{name}', which holds a {expected}; assign a value of the same kind"
                )
            }
        }
    }
}

impl std::error::Error for Error {}
