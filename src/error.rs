use std::fmt;

use crate::Span;

/// Errors produced while compiling or evaluating a Tuff program.
#[derive(Debug, PartialEq, Eq)]
pub enum TuffError {
    /// An unexpected character was encountered while lexing.
    UnexpectedChar {
        /// Where in the source the failure occurred.
        span: Span,
        /// The character that could not be lexed.
        ch: char,
    },
    /// A numeric literal was too large to represent.
    NumberOutOfRange {
        /// Where in the source the failure occurred.
        span: Span,
    },
    /// The input ended before a complete program was parsed.
    UnexpectedEndOfInput {
        /// Where in the source the failure occurred.
        span: Span,
    },
    /// A token was encountered where it was not expected.
    UnexpectedToken {
        /// Where in the source the failure occurred.
        span: Span,
    },
    /// A specific token was expected but not found.
    Expected {
        /// Where in the source the failure occurred.
        span: Span,
        /// The token that was expected.
        expected: &'static str,
    },
    /// A variable was used before it was defined.
    UndefinedVariable {
        /// Where in the source the failure occurred.
        span: Span,
        /// The name of the undefined variable.
        name: String,
    },
    /// A value of the wrong type was assigned to a variable.
    TypeMismatch {
        /// Where in the source the failure occurred.
        span: Span,
        /// The type of the value being assigned.
        found: &'static str,
        /// The type of the variable being assigned to.
        expected: &'static str,
        /// The name of the variable being assigned to.
        name: String,
    },
    /// A value of the wrong type was assigned to an array element.
    ElementTypeMismatch {
        /// Where in the source the failure occurred.
        span: Span,
        /// The type of the value being assigned.
        found: &'static str,
        /// The type of the element being assigned to.
        expected: &'static str,
    },
    /// A value was assigned to an immutable variable.
    ImmutableAssignment {
        /// Where in the source the failure occurred.
        span: Span,
        /// The name of the immutable variable.
        name: String,
    },
    /// An index was out of bounds for an array.
    IndexOutOfBounds {
        /// Where in the source the failure occurred.
        span: Span,
        /// The index that was out of bounds.
        index: i64,
        /// The length of the array.
        len: usize,
    },
    /// An index expression was applied to a non-array value.
    NotAnArray {
        /// Where in the source the failure occurred.
        span: Span,
    },
    /// A dereference was applied to a non-reference value.
    NotAReference {
        /// Where in the source the failure occurred.
        span: Span,
        /// The name of the non-reference variable.
        name: String,
    },
    /// An `if` condition was not a boolean.
    ExpectedBooleanCondition {
        /// Where in the source the failure occurred.
        span: Span,
    },
    /// An arithmetic or comparison operand was not an integer.
    ExpectedInteger {
        /// Where in the source the failure occurred.
        span: Span,
    },
    /// An array index was not an integer.
    ExpectedIntegerIndex {
        /// Where in the source the failure occurred.
        span: Span,
    },
    /// A `&` or `*` was not followed by a variable name.
    ExpectedVariableName {
        /// Where in the source the failure occurred.
        span: Span,
        /// The operator the variable name was expected after.
        after: &'static str,
    },
    /// An assignment was attempted through a shared reference.
    CannotAssignThroughSharedReference {
        /// Where in the source the failure occurred.
        span: Span,
    },
    /// An assignment target was not a variable, dereference, or index.
    InvalidAssignmentTarget {
        /// Where in the source the failure occurred.
        span: Span,
    },
    /// A block contained no expression statement to produce a value.
    BlockHasNoValue {
        /// Where in the source the failure occurred.
        span: Span,
    },
    /// An integer division had a zero divisor.
    DivisionByZero {
        /// Where in the source the failure occurred.
        span: Span,
    },
}

impl fmt::Display for TuffError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TuffError::UnexpectedChar { span, ch } => {
                write!(
                    f,
                    "lex error at {}..{}: unexpected character '{ch}'",
                    span.start, span.end
                )
            }
            TuffError::NumberOutOfRange { span } => {
                write!(
                    f,
                    "lex error at {}..{}: number out of range",
                    span.start, span.end
                )
            }
            TuffError::UnexpectedEndOfInput { span } => {
                write!(
                    f,
                    "parse error at {}..{}: unexpected end of input",
                    span.start, span.end
                )
            }
            TuffError::UnexpectedToken { span } => {
                write!(
                    f,
                    "parse error at {}..{}: unexpected token",
                    span.start, span.end
                )
            }
            TuffError::Expected { span, expected } => {
                write!(
                    f,
                    "parse error at {}..{}: expected '{expected}'",
                    span.start, span.end
                )
            }
            TuffError::UndefinedVariable { span, name } => {
                write!(
                    f,
                    "eval error at {}..{}: undefined variable '{name}'",
                    span.start, span.end
                )
            }
            TuffError::TypeMismatch {
                span,
                found,
                expected,
                name,
            } => {
                write!(
                    f,
                    "eval error at {}..{}: type mismatch: cannot assign {found} to {expected} variable '{name}'",
                    span.start, span.end
                )
            }
            TuffError::ElementTypeMismatch {
                span,
                found,
                expected,
            } => {
                write!(
                    f,
                    "eval error at {}..{}: type mismatch: cannot assign {found} to {expected} element",
                    span.start, span.end
                )
            }
            TuffError::ImmutableAssignment { span, name } => {
                write!(
                    f,
                    "eval error at {}..{}: cannot assign to immutable variable '{name}'",
                    span.start, span.end
                )
            }
            TuffError::IndexOutOfBounds { span, index, len } => {
                write!(
                    f,
                    "eval error at {}..{}: index {index} out of bounds for array of length {len}",
                    span.start, span.end
                )
            }
            TuffError::NotAnArray { span } => {
                write!(
                    f,
                    "eval error at {}..{}: expected an array",
                    span.start, span.end
                )
            }
            TuffError::NotAReference { span, name } => {
                write!(
                    f,
                    "eval error at {}..{}: '{name}' is not a reference",
                    span.start, span.end
                )
            }
            TuffError::ExpectedBooleanCondition { span } => {
                write!(
                    f,
                    "eval error at {}..{}: expected a boolean condition",
                    span.start, span.end
                )
            }
            TuffError::ExpectedInteger { span } => {
                write!(
                    f,
                    "eval error at {}..{}: expected an integer",
                    span.start, span.end
                )
            }
            TuffError::ExpectedIntegerIndex { span } => {
                write!(
                    f,
                    "eval error at {}..{}: expected an integer index",
                    span.start, span.end
                )
            }
            TuffError::ExpectedVariableName { span, after } => {
                write!(
                    f,
                    "eval error at {}..{}: expected a variable name after '{after}'",
                    span.start, span.end
                )
            }
            TuffError::CannotAssignThroughSharedReference { span } => {
                write!(
                    f,
                    "eval error at {}..{}: cannot assign through a shared reference",
                    span.start, span.end
                )
            }
            TuffError::InvalidAssignmentTarget { span } => {
                write!(
                    f,
                    "eval error at {}..{}: expected a variable name or dereference as assignment target",
                    span.start, span.end
                )
            }
            TuffError::BlockHasNoValue { span } => {
                write!(
                    f,
                    "eval error at {}..{}: block has no value",
                    span.start, span.end
                )
            }
            TuffError::DivisionByZero { span } => {
                write!(
                    f,
                    "eval error at {}..{}: division by zero",
                    span.start, span.end
                )
            }
        }
    }
}
