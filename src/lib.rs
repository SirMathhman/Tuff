//! The Tuff language compiler: lex, parse, and evaluate Tuff source.

/// The AST data types for Tuff expressions and statements.
pub mod ast;
/// Orchestrates the compiler pipeline.
pub mod driver;
/// Errors produced while compiling or evaluating a Tuff program.
pub mod error;
/// The tree-walking interpreter.
pub mod eval;
/// Converts source text into a flat list of tokens.
pub mod lexer;
/// Converts a token stream into an AST.
pub mod parser;
/// The static analysis (type-checking) pass.
pub mod typeck;

/// The error type for the Tuff compiler.
pub use error::TuffError;

/// A span of character offsets into the input source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    /// The first character offset (inclusive).
    pub start: usize,
    /// The last character offset (exclusive).
    pub end: usize,
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
            Err(TuffError::UnexpectedEndOfInput {
                span: Span { start: 0, end: 0 },
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
    fn ten_divided_by_five_evaluates_to_two() {
        assert_eq!(evaluate("10 / 5"), Ok(eval::Value::Int(2)));
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
    fn mutable_let_binding_with_trailing_assignment_evaluates_to_zero() {
        assert_eq!(evaluate("let mut x = 1; x = 2;"), Ok(eval::Value::Int(0)));
    }

    #[test]
    fn assigning_boolean_to_integer_variable_is_an_eval_error() {
        assert_eq!(
            evaluate("let mut x = 1; x = true;"),
            Err(TuffError::TypeMismatch {
                span: Span { start: 15, end: 16 },
                found: "boolean",
                expected: "integer",
                name: "x".into(),
            })
        );
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
            Ok(eval::Value::Ref(typeck::VarId::new(0), "x".into()))
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
    fn true_literal_evaluates_to_true() {
        assert_eq!(evaluate("let x = true; x"), Ok(eval::Value::Bool(true)));
    }

    #[test]
    fn less_than_of_smaller_integer_evaluates_to_one() {
        assert_eq!(
            evaluate("let x = 1; let y = 2; x < y"),
            Ok(eval::Value::Bool(true))
        );
    }

    #[test]
    fn less_than_or_equal_of_equal_integers_evaluates_to_true() {
        assert_eq!(
            evaluate("let x = 2; let y = 2; x <= y"),
            Ok(eval::Value::Bool(true))
        );
    }

    #[test]
    fn greater_than_of_larger_integer_evaluates_to_true() {
        assert_eq!(
            evaluate("let x = 2; let y = 1; x > y"),
            Ok(eval::Value::Bool(true))
        );
    }

    #[test]
    fn greater_than_or_equal_of_equal_integers_evaluates_to_true() {
        assert_eq!(
            evaluate("let x = 2; let y = 2; x >= y"),
            Ok(eval::Value::Bool(true))
        );
    }

    #[test]
    fn inequality_of_different_values_evaluates_to_true() {
        assert_eq!(
            evaluate("let x = 1; let y = 2; x != y"),
            Ok(eval::Value::Bool(true))
        );
    }

    #[test]
    fn false_literal_evaluates_to_false() {
        assert_eq!(evaluate("let x = false; x"), Ok(eval::Value::Bool(false)));
    }

    #[test]
    fn boolean_displays_as_true_or_false() {
        assert_eq!(evaluate("true").unwrap().to_string(), "true");
        assert_eq!(evaluate("false").unwrap().to_string(), "false");
    }

    #[test]
    fn equality_of_different_values_evaluates_to_zero() {
        assert_eq!(
            evaluate("let x = 1; let y = 2; x == y"),
            Ok(eval::Value::Bool(false))
        );
    }

    #[test]
    fn equality_of_int_and_bool_evaluates_to_zero() {
        assert_eq!(
            evaluate("let x = 1; let y = true; x == y"),
            Ok(eval::Value::Bool(false))
        );
    }

    #[test]
    fn array_index_sum_evaluates_to_six() {
        assert_eq!(
            evaluate("let array = [1, 2, 3]; array[0] + array[1] + array[2]"),
            Ok(eval::Value::Int(6))
        );
    }

    #[test]
    fn mutable_array_index_assignment_evaluates_to_one() {
        assert_eq!(
            evaluate("let mut array = [0]; array[0] = 1; array[0]"),
            Ok(eval::Value::Int(1))
        );
    }

    #[test]
    fn array_element_assignment_type_mismatch_is_an_error() {
        assert_eq!(
            evaluate("let mut a = [1, 2]; a[0] = true;"),
            Err(TuffError::ElementTypeMismatch {
                span: Span { start: 23, end: 24 },
                found: "boolean",
                expected: "integer",
            })
        );
    }

    #[test]
    fn mixed_type_array_literal_is_an_error() {
        assert_eq!(
            evaluate("[1, true]"),
            Err(TuffError::ElementTypeMismatch {
                span: Span { start: 4, end: 8 },
                found: "boolean",
                expected: "integer",
            })
        );
    }

    #[test]
    fn if_else_with_false_condition_evaluates_to_else_branch() {
        assert_eq!(
            evaluate("let x = if (false) 2 else 3; x"),
            Ok(eval::Value::Int(3))
        );
    }

    #[test]
    fn if_else_with_block_branches_evaluates_to_else_branch() {
        assert_eq!(
            evaluate("let x = if (false) { let y = 2; y } else { let y = 3; y }; x"),
            Ok(eval::Value::Int(3))
        );
    }

    #[test]
    fn if_else_with_type_mismatch_in_else_branch_is_an_eval_error() {
        assert_eq!(
            evaluate(
                "let x = if (false) { let y = 2; y } else { let mut a = 0; a = true; let y = 3; y }; x"
            ),
            Err(TuffError::TypeMismatch {
                span: Span { start: 58, end: 59 },
                found: "boolean",
                expected: "integer",
                name: "a".into(),
            })
        );
    }

    #[test]
    fn if_else_with_type_mismatch_in_untaken_then_branch_is_an_eval_error() {
        assert_eq!(
            evaluate(
                "let x = if (false) { let mut a = 0; a = true; let y = 2; y } else { let y = 3; y }; x"
            ),
            Err(TuffError::TypeMismatch {
                span: Span { start: 36, end: 37 },
                found: "boolean",
                expected: "integer",
                name: "a".into(),
            })
        );
    }

    #[test]
    fn if_else_with_immutable_assignment_in_untaken_then_branch_is_an_eval_error() {
        assert_eq!(
            evaluate("let x = if (false) { let z = 0; z = 1; z } else { let y = 3; y }; x"),
            Err(TuffError::ImmutableAssignment {
                span: Span { start: 32, end: 33 },
                name: "z".into(),
            })
        );
    }

    #[test]
    fn if_else_with_literal_division_by_zero_in_untaken_then_branch_is_an_error() {
        assert_eq!(
            evaluate("let x = if (false) { 1 / 0 } else { let y = 3; y }; x"),
            Err(TuffError::DivisionByZero {
                span: Span { start: 23, end: 24 }
            })
        );
    }

    #[test]
    fn loop_with_break_evaluates_to_break_value() {
        assert_eq!(
            evaluate("let x = loop { break 3; }; x"),
            Ok(eval::Value::Int(3))
        );
    }

    #[test]
    fn if_else_untaken_branch_side_effects_do_not_leak() {
        assert_eq!(
            evaluate("let mut signal = 0; let y = if (false) { signal = 1; 2 } else 3; signal"),
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
    fn assignment_to_outer_scope_mut_variable_persists_after_block() {
        assert_eq!(
            evaluate("let mut x = 0; { x = 5; } x"),
            Ok(eval::Value::Int(5))
        );
    }

    #[test]
    fn assignment_to_outer_scope_immutable_variable_is_an_eval_error() {
        assert_eq!(
            evaluate("let x = 0; { x = 5; x }"),
            Err(TuffError::ImmutableAssignment {
                span: Span { start: 13, end: 14 },
                name: "x".into(),
            })
        );
    }

    #[test]
    fn undefined_variable_in_nested_block_is_an_eval_error() {
        assert_eq!(
            evaluate("{ { x } }"),
            Err(TuffError::UndefinedVariable {
                span: Span { start: 4, end: 5 },
                name: "x".into(),
            })
        );
    }

    #[test]
    fn undefined_variable_is_an_eval_error() {
        assert_eq!(
            evaluate("x"),
            Err(TuffError::UndefinedVariable {
                span: Span { start: 0, end: 1 },
                name: "x".into(),
            })
        );
    }

    #[test]
    fn dangling_operator_is_a_parse_error() {
        assert_eq!(
            evaluate("1 +"),
            Err(TuffError::UnexpectedEndOfInput {
                span: Span { start: 2, end: 3 },
            })
        );
    }

    #[test]
    fn unexpected_closing_paren_is_a_parse_error() {
        assert_eq!(
            evaluate("1 + )"),
            Err(TuffError::UnexpectedToken {
                span: Span { start: 4, end: 5 },
            })
        );
    }

    #[test]
    fn assignment_in_nested_block_is_visible_outside() {
        assert_eq!(
            evaluate("let mut x = 0; { x = 1; } x"),
            Ok(eval::Value::Int(1))
        );
    }
}
