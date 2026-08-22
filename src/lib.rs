pub mod ast;
pub mod driver;
pub mod eval;
pub mod lexer;
pub mod parser;

use std::fmt;

/// A span of character offsets into the input source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

/// Errors produced while evaluating a Tuff expression.
#[derive(Debug, PartialEq, Eq)]
pub enum TuffError {
    /// The input could not be lexed at the given span.
    Lex { span: Span, message: String },
    /// The input could not be parsed at the given span.
    Parse { span: Span, message: String },
}

impl fmt::Display for TuffError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TuffError::Lex { span, message } => {
                write!(f, "lex error at {}..{}: {}", span.start, span.end, message)
            }
            TuffError::Parse { span, message } => {
                write!(
                    f,
                    "parse error at {}..{}: {}",
                    span.start, span.end, message
                )
            }
        }
    }
}

/// Evaluate a Tuff expression and return its value.
pub fn evaluate(input: &str) -> Result<i64, TuffError> {
    driver::run(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_is_a_parse_error() {
        assert_eq!(
            evaluate(""),
            Err(TuffError::Parse {
                span: Span { start: 0, end: 0 },
                message: "expected a number".to_string(),
            })
        );
    }

    #[test]
    fn one_evaluates_to_one() {
        assert_eq!(evaluate("1"), Ok(1));
    }

    #[test]
    fn one_plus_two_evaluates_to_three() {
        assert_eq!(evaluate("1 + 2"), Ok(3));
    }

    #[test]
    fn one_plus_two_plus_three_evaluates_to_six() {
        assert_eq!(evaluate("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn two_plus_three_minus_four_evaluates_to_one() {
        assert_eq!(evaluate("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn two_times_three_plus_four_evaluates_to_ten() {
        assert_eq!(evaluate("2 * 3 + 4"), Ok(10));
    }

    #[test]
    fn two_plus_three_times_four_evaluates_to_fourteen() {
        assert_eq!(evaluate("2 + 3 * 4"), Ok(14));
    }

    #[test]
    fn parenthesized_two_plus_three_times_four_evaluates_to_twenty() {
        assert_eq!(evaluate("(2 + 3) * 4"), Ok(20));
    }

    #[test]
    fn dangling_operator_is_a_parse_error() {
        assert_eq!(
            evaluate("1 +"),
            Err(TuffError::Parse {
                span: Span { start: 2, end: 3 },
                message: "expected a number".to_string(),
            })
        );
    }
}
