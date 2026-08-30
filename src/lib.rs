pub mod ast;
pub mod errors;
pub mod eval;
pub mod lexer;
pub mod parser;

pub use errors::Error;

/// Evaluate an arithmetic expression of integers with `+`, `-`, `*`,
/// parentheses and braces for grouping, and `let` bindings inside braces.
///
/// Pipeline: lex → parse → eval.
pub fn evaluate(input: &str) -> Result<i64, Error> {
    let tokens = lexer::lex(input)?;
    if tokens.is_empty() {
        // Empty input is defined to evaluate to 0.
        return Ok(0);
    }
    let expr = parser::parse(&tokens)?;
    let mut env = eval::Environment::new();
    eval::eval(&expr, &mut env)
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
            Err(Error::UndefinedVariable { name }) => {
                assert_eq!(name, "x");
            }
            other => panic!("expected UndefinedVariable, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_span_with_leading_whitespace() {
        match evaluate("  1 + x") {
            Err(Error::UndefinedVariable { name }) => {
                assert_eq!(name, "x");
            }
            other => panic!("expected UndefinedVariable, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_let_binding() {
        assert_eq!(evaluate("{ let x = 2 + 3; x } * 4"), Ok(20));
    }
}
