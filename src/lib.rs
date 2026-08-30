pub mod ast;
pub mod errors;
pub mod eval;
pub mod lexer;
pub mod parser;

pub use errors::Error;

/// Evaluate an arithmetic expression of integers with `+`, `-`, `*`,
/// and parentheses for grouping.
///
/// Pipeline: lex → parse → eval.
pub fn evaluate(input: &str) -> Result<i64, Error> {
    let tokens = lexer::lex(input)?;
    if tokens.is_empty() {
        // Empty input is defined to evaluate to 0.
        return Ok(0);
    }
    let expr = parser::parse(&tokens)?;
    Ok(eval::eval(&expr))
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
    fn test_evaluate_invalid_input() {
        match evaluate("1 + x") {
            Err(Error::UnexpectedChar { span, ch }) => {
                assert_eq!(ch, 'x');
                assert_eq!(span, errors::Span { start: 4, end: 5 });
            }
            other => panic!("expected UnexpectedChar, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_span_with_leading_whitespace() {
        match evaluate("  1 + x") {
            Err(Error::UnexpectedChar { span, ch }) => {
                assert_eq!(ch, 'x');
                assert_eq!(span, errors::Span { start: 6, end: 7 });
            }
            other => panic!("expected UnexpectedChar, got {:?}", other),
        }
    }
}
