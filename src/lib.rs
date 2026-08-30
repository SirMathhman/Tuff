pub mod ast;
pub mod errors;
pub mod eval;
pub mod lexer;
pub mod parser;
pub mod span;
pub mod value;

pub use errors::Error;
pub use span::Span;

/// Evaluate an arithmetic expression of integers with `+`, `-`, `*`,
/// parentheses and braces for grouping, and `let` bindings at the top
/// level and inside braces.
///
/// Pipeline: lex → parse → eval.
pub fn evaluate(input: &str) -> Result<i64, Error> {
    let tokens = lexer::lex(input)?;
    if tokens.is_empty() {
        // Empty input is defined to evaluate to 0.
        return Ok(0);
    }
    let expr = parser::parse(&tokens)?;
    let mut env = value::Environment::new();
    let value = eval::eval(&expr, &mut env)?;
    match value {
        value::Value::Int(n) => Ok(n),
        value::Value::Bool(b) => Ok(if b { 1 } else { 0 }),
        value::Value::Ref { name, span } => Err(Error::UnexpectedToken {
            span,
            token: format!("reference to '{name}' as final result"),
        }),
        value::Value::RefMut { name, span } => Err(Error::UnexpectedToken {
            span,
            token: format!("mutable reference to '{name}' as final result"),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_empty_string() {
        assert_eq!(evaluate(""), Ok(0));
    }

    #[test]
    fn test_evaluate_single_digit() {
        assert_eq!(evaluate("1"), Ok(1));
    }

    #[test]
    fn test_evaluate_addition() {
        assert_eq!(evaluate("1 + 2"), Ok(3));
    }

    #[test]
    fn test_evaluate_chained_addition() {
        assert_eq!(evaluate("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_evaluate_addition_and_subtraction() {
        assert_eq!(evaluate("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn test_evaluate_multiplication_precedence() {
        assert_eq!(evaluate("2 * 3 + 4"), Ok(10));
    }

    #[test]
    fn test_evaluate_addition_before_multiplication() {
        assert_eq!(evaluate("2 + 3 * 4"), Ok(14));
    }

    #[test]
    fn test_evaluate_parentheses_override_precedence() {
        assert_eq!(evaluate("(2 + 3) * 4"), Ok(20));
    }

    #[test]
    fn test_evaluate_unary_minus() {
        assert_eq!(evaluate("2 * -3"), Ok(-6));
        assert_eq!(evaluate("-(2 + 3)"), Ok(-5));
    }

    #[test]
    fn test_evaluate_braces_override_precedence() {
        assert_eq!(evaluate("{ 2 + 3 } * 4"), Ok(20));
    }

    #[test]
    fn test_evaluate_undefined_variable() {
        match evaluate("1 + x") {
            Err(Error::UndefinedVariable { span, name }) => {
                assert_eq!(name, "x");
                assert_eq!(span, span::Span { start: 4, end: 5 });
            }
            other => panic!("expected UndefinedVariable, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_span_with_leading_whitespace() {
        match evaluate("  1 + x") {
            Err(Error::UndefinedVariable { span, name }) => {
                assert_eq!(name, "x");
                assert_eq!(span, span::Span { start: 6, end: 7 });
            }
            other => panic!("expected UndefinedVariable, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_let_binding() {
        assert_eq!(evaluate("{ let x = 2 + 3; x } * 4"), Ok(20));
    }

    #[test]
    fn test_evaluate_chained_let_bindings() {
        assert_eq!(evaluate("{ let x = 2 + 3; let y = x; y } * 4"), Ok(20));
    }

    #[test]
    fn test_evaluate_top_level_let() {
        assert_eq!(
            evaluate("let z = { let x = 2 + 3; let y = x; y } * 4; z"),
            Ok(20)
        );
    }

    #[test]
    fn test_evaluate_mut_assignment() {
        assert_eq!(evaluate("let mut x = 0; x = 1; x"), Ok(1));
    }

    #[test]
    fn test_evaluate_keyword_as_ident_rejected() {
        // 'let' is a keyword, not a valid variable name
        assert!(evaluate("let let = 1; let").is_err());
    }

    #[test]
    fn test_evaluate_assign_to_immutable() {
        match evaluate("let x = 0; x = 1; x") {
            Err(Error::ImmutableVariable { span, name }) => {
                assert_eq!(name, "x");
                assert_eq!(span, span::Span { start: 11, end: 12 });
            }
            other => panic!("expected ImmutableVariable, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_reference_and_dereference() {
        assert_eq!(evaluate("let x = 1; let y = &x; *y"), Ok(1));
    }

    #[test]
    fn test_evaluate_double_dereference() {
        assert_eq!(evaluate("let x = 1; let y = &x; let z = &y; **z"), Ok(1));
    }

    #[test]
    fn test_evaluate_mut_reference_and_deref_assign() {
        assert_eq!(evaluate("let mut x = 0; let y = &mut x; *y = 1; x"), Ok(1));
    }

    #[test]
    fn test_evaluate_true_literal() {
        assert_eq!(evaluate("let x = true; x"), Ok(1));
    }

    #[test]
    fn test_evaluate_false_literal_and_or() {
        assert_eq!(evaluate("let x = true; let y = false; x || y"), Ok(1));
    }

    #[test]
    fn test_evaluate_and() {
        assert_eq!(evaluate("let x = true; let y = false; x && y"), Ok(0));
    }

    #[test]
    fn test_evaluate_equality_not_equal() {
        assert_eq!(evaluate("let x = 1; let y = 2; x == y"), Ok(0));
    }

    #[test]
    fn test_evaluate_less_than() {
        assert_eq!(evaluate("let x = 0; let y = 1; x < y"), Ok(1));
    }

    #[test]
    fn test_evaluate_not() {
        assert_eq!(evaluate("let x = true; !x"), Ok(0));
    }

    #[test]
    fn test_evaluate_bool_int_equality_rejected() {
        match evaluate("true == 1") {
            Err(Error::TypeMismatch { .. }) => {}
            other => panic!("expected TypeMismatch, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_comparison_result_not_comparable_to_int() {
        match evaluate("(2 == 2) == 1") {
            Err(Error::TypeMismatch { .. }) => {}
            other => panic!("expected TypeMismatch, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_or_result_comparable_to_bool() {
        assert_eq!(evaluate("(true || false) == true"), Ok(1));
    }

    #[test]
    fn test_evaluate_if_expression() {
        assert_eq!(evaluate("let x = if (true) 2 else 3; x"), Ok(2));
    }

    #[test]
    fn test_evaluate_compound_addition() {
        assert_eq!(evaluate("let mut x = 1; x += 2; x"), Ok(3));
    }

    #[test]
    fn test_evaluate_block_scoping() {
        assert_eq!(evaluate("{ let x = 1; x } + { let x = 2; x }"), Ok(3));
    }

    #[test]
    fn test_evaluate_block_as_statement() {
        assert_eq!(evaluate("let mut x = 0; { x = 1; } x"), Ok(1));
    }

    #[test]
    fn test_unexpected_token_message_lists_unary_operators() {
        // Regression: error messages must stay in sync with the grammar.
        let msg = evaluate("let x = ; x").unwrap_err().to_string();
        assert!(msg.contains("'&'"), "message should mention '&': {msg}");
        assert!(msg.contains("'*'"), "message should mention '*': {msg}");
        assert!(msg.contains("'-'"), "message should mention '-': {msg}");
        assert!(msg.contains("'!'"), "message should mention '!': {msg}");
    }
}
