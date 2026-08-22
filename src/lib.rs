//! The Tuff language compiler: lex, parse, and evaluate Tuff source.

/// The AST data types for Tuff expressions and statements.
pub mod ast;
/// Orchestrates the compiler pipeline.
pub mod driver;
/// The tree-walking interpreter.
pub mod eval;
/// Converts source text into a flat list of tokens.
pub mod lexer;
/// Converts a token stream into an AST.
pub mod parser;

use std::fmt;

/// A span of character offsets into the input source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    /// The first character offset (inclusive).
    pub start: usize,
    /// The last character offset (exclusive).
    pub end: usize,
}

/// Errors produced while evaluating a Tuff expression.
#[derive(Debug, PartialEq, Eq)]
pub enum TuffError {
    /// The input could not be lexed at the given span.
    Lex {
        /// Where in the source the failure occurred.
        span: Span,
        /// What went wrong and why.
        message: String,
    },
    /// The input could not be parsed at the given span.
    Parse {
        /// Where in the source the failure occurred.
        span: Span,
        /// What went wrong and why.
        message: String,
    },
    /// The input failed to evaluate at the given span.
    Eval {
        /// Where in the source the failure occurred.
        span: Span,
        /// What went wrong and why.
        message: String,
    },
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
            TuffError::Eval { span, message } => {
                write!(f, "eval error at {}..{}: {}", span.start, span.end, message)
            }
        }
    }
}

/// Evaluate a Tuff expression and return its value.
pub fn evaluate(input: &str) -> Result<eval::Value, TuffError> {
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
                message: "unexpected end of input".to_string(),
            })
        );
    }

    #[test]
    fn one_evaluates_to_one() {
        assert_eq!(evaluate("1"), Ok(eval::Value::Int(1)));
    }

    #[test]
    fn one_plus_two_evaluates_to_three() {
        assert_eq!(evaluate("1 + 2"), Ok(eval::Value::Int(3)));
    }

    #[test]
    fn one_plus_two_plus_three_evaluates_to_six() {
        assert_eq!(evaluate("1 + 2 + 3"), Ok(eval::Value::Int(6)));
    }

    #[test]
    fn two_plus_three_minus_four_evaluates_to_one() {
        assert_eq!(evaluate("2 + 3 - 4"), Ok(eval::Value::Int(1)));
    }

    #[test]
    fn two_times_three_plus_four_evaluates_to_ten() {
        assert_eq!(evaluate("2 * 3 + 4"), Ok(eval::Value::Int(10)));
    }

    #[test]
    fn two_plus_three_times_four_evaluates_to_fourteen() {
        assert_eq!(evaluate("2 + 3 * 4"), Ok(eval::Value::Int(14)));
    }

    #[test]
    fn parenthesized_two_plus_three_times_four_evaluates_to_twenty() {
        assert_eq!(evaluate("(2 + 3) * 4"), Ok(eval::Value::Int(20)));
    }

    #[test]
    fn braced_two_plus_three_times_four_evaluates_to_twenty() {
        assert_eq!(evaluate("{ 2 + 3 } * 4"), Ok(eval::Value::Int(20)));
    }

    #[test]
    fn let_binding_in_block_times_four_evaluates_to_twenty() {
        assert_eq!(
            evaluate("{ let x = 2 + 3; x } * 4"),
            Ok(eval::Value::Int(20))
        );
    }

    #[test]
    fn chained_let_bindings_in_block_times_four_evaluates_to_twenty() {
        assert_eq!(
            evaluate("{ let x = 2 + 3; let y = x; y } * 4"),
            Ok(eval::Value::Int(20))
        );
    }

    #[test]
    fn top_level_let_binding_evaluates_to_twenty() {
        assert_eq!(
            evaluate("let y = { let x = 2 + 3; x } * 4; y"),
            Ok(eval::Value::Int(20))
        );
    }

    #[test]
    fn mutable_let_binding_with_assignment_evaluates_to_one() {
        assert_eq!(evaluate("let mut x = 0; x = 1; x"), Ok(eval::Value::Int(1)));
    }

    #[test]
    fn reference_and_dereference_evaluates_to_one() {
        assert_eq!(
            evaluate("let x = 1; let y = &x; *y"),
            Ok(eval::Value::Int(1))
        );
    }

    #[test]
    fn reference_value_is_not_an_integer() {
        assert_eq!(
            evaluate("let x = 1; let y = &x; y"),
            Ok(eval::Value::Ref("x".into()))
        );
    }

    #[test]
    fn mutable_reference_assignment_evaluates_to_one() {
        assert_eq!(
            evaluate("let mut x = 0; let y = &mut x; *y = 1; x"),
            Ok(eval::Value::Int(1))
        );
    }

    #[test]
    fn true_literal_evaluates_to_one() {
        assert_eq!(evaluate("let x = true; x"), Ok(eval::Value::Int(1)));
    }

    #[test]
    fn false_literal_evaluates_to_zero() {
        assert_eq!(evaluate("let x = false; x"), Ok(eval::Value::Int(0)));
    }

    #[test]
    fn equality_of_different_values_evaluates_to_zero() {
        assert_eq!(
            evaluate("let x = 1; let y = 2; x == y"),
            Ok(eval::Value::Int(0))
        );
    }

    #[test]
    fn nested_block_reads_outer_binding() {
        assert_eq!(evaluate("{ let x = 2; { x } }"), Ok(eval::Value::Int(2)));
    }

    #[test]
    fn assignment_to_outer_scope_mut_variable_evaluates() {
        assert_eq!(
            evaluate("let mut x = 0; { x = 5; x }"),
            Ok(eval::Value::Int(5))
        );
    }

    #[test]
    fn assignment_to_outer_scope_immutable_variable_is_an_eval_error() {
        assert_eq!(
            evaluate("let x = 0; { x = 5; x }"),
            Err(TuffError::Eval {
                span: Span { start: 13, end: 14 },
                message: "cannot assign to immutable variable 'x'".to_string(),
            })
        );
    }

    #[test]
    fn undefined_variable_in_nested_block_is_an_eval_error() {
        assert_eq!(
            evaluate("{ { x } }"),
            Err(TuffError::Eval {
                span: Span { start: 3, end: 4 },
                message: "undefined variable 'x'".to_string(),
            })
        );
    }

    #[test]
    fn undefined_variable_is_an_eval_error() {
        assert_eq!(
            evaluate("x"),
            Err(TuffError::Eval {
                span: Span { start: 0, end: 1 },
                message: "undefined variable 'x'".to_string(),
            })
        );
    }

    #[test]
    fn dangling_operator_is_a_parse_error() {
        assert_eq!(
            evaluate("1 +"),
            Err(TuffError::Parse {
                span: Span { start: 2, end: 3 },
                message: "unexpected end of input".to_string(),
            })
        );
    }

    #[test]
    fn unexpected_closing_paren_is_a_parse_error() {
        assert_eq!(
            evaluate("1 + )"),
            Err(TuffError::Parse {
                span: Span { start: 4, end: 5 },
                message: "unexpected token".to_string(),
            })
        );
    }
}
