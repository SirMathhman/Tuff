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
        f.write_str(&self.message())
    }
}

impl TuffError {
    /// The human-readable message for this error.
    fn message(&self) -> String {
        match self {
            TuffError::UnexpectedChar { span, ch } => {
                format!("{}unexpected character '{ch}'", span_header("lex", *span))
            }
            TuffError::NumberOutOfRange { span } => {
                format!("{}number out of range", span_header("lex", *span))
            }
            TuffError::UnexpectedEndOfInput { span } => {
                format!("{}unexpected end of input", span_header("parse", *span))
            }
            TuffError::UnexpectedToken { span } => {
                format!("{}unexpected token", span_header("parse", *span))
            }
            TuffError::Expected { span, expected } => {
                format!("{}expected '{expected}'", span_header("parse", *span))
            }
            TuffError::UndefinedVariable { span, name } => {
                format!("{}undefined variable '{name}'", span_header("eval", *span))
            }
            TuffError::TypeMismatch {
                span,
                found,
                expected,
                name,
            } => format!(
                "{}type mismatch: cannot assign {found} to {expected} variable '{name}'",
                span_header("eval", *span)
            ),
            TuffError::ElementTypeMismatch {
                span,
                found,
                expected,
            } => format!(
                "{}type mismatch: cannot assign {found} to {expected} element",
                span_header("eval", *span)
            ),
            TuffError::ImmutableAssignment { span, name } => format!(
                "{}cannot assign to immutable variable '{name}'",
                span_header("eval", *span)
            ),
            TuffError::IndexOutOfBounds { span, index, len } => format!(
                "{}index {index} out of bounds for array of length {len}",
                span_header("eval", *span)
            ),
            TuffError::NotAnArray { span } => {
                format!("{}expected an array", span_header("eval", *span))
            }
            TuffError::NotAReference { span, name } => {
                format!("{}'{name}' is not a reference", span_header("eval", *span))
            }
            TuffError::ExpectedBooleanCondition { span } => {
                format!("{}expected a boolean condition", span_header("eval", *span))
            }
            TuffError::ExpectedInteger { span } => {
                format!("{}expected an integer", span_header("eval", *span))
            }
            TuffError::ExpectedIntegerIndex { span } => {
                format!("{}expected an integer index", span_header("eval", *span))
            }
            TuffError::ExpectedVariableName { span, after } => format!(
                "{}expected a variable name after '{after}'",
                span_header("eval", *span)
            ),
            TuffError::CannotAssignThroughSharedReference { span } => format!(
                "{}cannot assign through a shared reference",
                span_header("eval", *span)
            ),
            TuffError::InvalidAssignmentTarget { span } => format!(
                "{}expected a variable name or dereference as assignment target",
                span_header("eval", *span)
            ),
            TuffError::BlockHasNoValue { span } => {
                format!("{}block has no value", span_header("eval", *span))
            }
            TuffError::DivisionByZero { span } => {
                format!("{}division by zero", span_header("eval", *span))
            }
        }
    }
}

/// The shared prefix of an error message: the pipeline stage and source span.
fn span_header(stage: &str, span: Span) -> String {
    format!("{stage} error at {}..{}: ", span.start, span.end)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span() -> Span {
        Span { start: 0, end: 1 }
    }

    #[test]
    fn displays_unexpected_character() {
        let err = TuffError::UnexpectedChar {
            span: span(),
            ch: '@',
        };
        assert_eq!(
            err.to_string(),
            "lex error at 0..1: unexpected character '@'"
        );
    }

    #[test]
    fn displays_expected_token() {
        let err = TuffError::Expected {
            span: span(),
            expected: "]",
        };
        assert_eq!(err.to_string(), "parse error at 0..1: expected ']'");
    }

    #[test]
    fn displays_undefined_variable() {
        let err = TuffError::UndefinedVariable {
            span: span(),
            name: "x".to_string(),
        };
        assert_eq!(
            err.to_string(),
            "eval error at 0..1: undefined variable 'x'"
        );
    }

    #[test]
    fn displays_division_by_zero() {
        let err = TuffError::DivisionByZero { span: span() };
        assert_eq!(err.to_string(), "eval error at 0..1: division by zero");
    }
}
