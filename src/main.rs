#![cfg_attr(coverage_nightly, feature(coverage_attribute))]

mod lexer;
pub(crate) mod parser;

#[cfg_attr(coverage_nightly, coverage(off))]
fn main() {
    use std::io::{self, BufRead};

    println!("Tuff REPL — type an expression and press Enter (Ctrl+C to quit)");

    let stdin = io::stdin();

    for line in stdin.lock().lines() {
        match line {
            Ok(input) => {
                if input.trim().is_empty() {
                    continue;
                }
                match parser::interpret(&input) {
                    Ok(result) => println!("{}", result),
                    Err(e) => eprintln!("Error: {}", e),
                }
            }
            Err(_) => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::parser::*;

    #[test]
    fn test_empty_string() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn test_whitespace_only() {
        assert_eq!(interpret(" "), Ok(0));
    }

    #[test]
    fn test_single_digit() {
        assert_eq!(interpret("1"), Ok(1));
    }

    #[test]
    fn test_single_digit_two() {
        assert_eq!(interpret("2"), Ok(2));
    }

    #[test]
    fn test_addition_expression() {
        assert_eq!(interpret("1 + 2"), Ok(3));
    }

    #[test]
    fn test_undefined_variable_returns_err() {
        assert!(interpret("abc").is_err());
    }

    #[test]
    fn test_parse_error_returns_err() {
        assert!(interpret(")").is_err());
    }

    #[test]
    fn test_negative_addition() {
        assert_eq!(interpret("-1 + -2"), Ok(-3));
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(interpret("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_mixed_add_subtract() {
        assert_eq!(interpret("3 + 2 - 4"), Ok(1));
    }

    #[test]
    fn test_multiplication_expression() {
        assert_eq!(interpret("5 * 3"), Ok(15));
    }

    #[test]
    fn test_mixed_mul_subtract() {
        assert_eq!(interpret("3 * 2 - 4"), Ok(2));
    }

    #[test]
    fn test_precedence_add_then_mul() {
        assert_eq!(interpret("3 + 2 * 4"), Ok(11));
    }

    #[test]
    fn test_division_truncates() {
        assert_eq!(interpret("5 / 3"), Ok(1));
    }

    #[test]
    fn test_trailing_mul_operator() {
        assert!(interpret("5 *").is_err());
    }

    #[test]
    fn test_trailing_add_operator() {
        assert!(interpret("5 +").is_err());
    }

    #[test]
    fn test_parenthesized_expression() {
        assert_eq!(interpret("(3 + 2) * 4"), Ok(20));
    }

    #[test]
    fn test_empty_parens() {
        assert!(interpret("()").is_err());
    }

    #[test]
    fn test_unrecognized_token_in_factor() {
        assert!(interpret(")").is_err());
    }

    #[test]
    fn test_division_expression() {
        assert_eq!(interpret("6 / 2"), Ok(3));
    }

    #[test]
    fn test_modulo_expression() {
        assert_eq!(interpret("5 % 3"), Ok(2));
    }

    #[test]
    fn test_braced_expression() {
        assert_eq!(interpret("{ 3 + 2 } * 4"), Ok(20));
    }

    #[test]
    fn test_let_binding_in_block() {
        assert_eq!(interpret("{ let x = 3 + 2; x } * 4"), Ok(20));
    }

    #[test]
    fn test_unrecognized_char_skipped() {
        // Characters like '@' are silently skipped by the tokenizer
        assert_eq!(interpret("1 @+ 2"), Ok(3));
    }

    #[test]
    fn test_let_without_var_name_errors() {
        // No tokens at all after "let" — hits the pos >= tokens.len() guard
        assert!(interpret("{ let").is_err());
    }

    #[test]
    fn test_let_without_equals_errors() {
        assert!(interpret("{ let x; } ").is_err());
    }

    #[test]
    fn test_standalone_semicolon_in_block() {
        assert_eq!(interpret("{ ; 3 + 2 }"), Ok(5));
    }

    #[test]
    fn test_top_level_let_with_nested_block() {
        assert_eq!(interpret("let y = { let x = 3 + 2; x } * 4; y"), Ok(20));
    }

    #[test]
    fn test_top_level_semicolon() {
        // Bare semicolons at the top level should be handled gracefully
        assert_eq!(interpret("; 5 ; "), Ok(5));
    }

    #[test]
    fn test_reassign_immutable_errors() {
        // Reassigning a non-mut variable should fail
        assert!(interpret("let x = 0; x = 1; x").is_err());
    }

    #[test]
    fn test_let_only_returns_zero() {
        // No trailing expression, so result stays at initial value of 0
        assert_eq!(interpret("let x = 100;"), Ok(0));
    }

    #[test]
    fn test_mut_and_reassignment() {
        assert_eq!(interpret("let mut x = 0; x = 1; x"), Ok(1));
    }

    #[test]
    fn test_assignment_in_expression_context() {
        // Assignment inside parens exercises the parse_factor assignment path
        assert_eq!(interpret("let mut x = 0; (x = 5) + 3"), Ok(8));
    }

    #[test]
    fn test_boolean_true_returns_one() {
        assert_eq!(interpret("let x = true; x"), Ok(1));
    }

    #[test]
    fn test_boolean_false_returns_zero() {
        assert_eq!(interpret("let x = false; x"), Ok(0));
    }

    #[test]
    fn test_logical_or_with_booleans() {
        assert_eq!(interpret("let x = true; let y = false; x || y"), Ok(1));
    }

    #[test]
    fn test_logical_and_with_booleans() {
        assert_eq!(interpret("let x = true; let y = false; x && y"), Ok(0));
    }

    #[test]
    fn test_reassign_in_block_persists() {
        // Block shares scope with parent, so assignment inside persists after block ends
        assert_eq!(interpret("let mut x = 0; { x = 1; } x"), Ok(1));
    }

    #[test]
    fn test_let_shadowing_allows_rebind() {
        // let x = ... followed by another let x = ... should shadow the first binding
        assert_eq!(interpret("let x = 0; let x = 1; x"), Ok(1));
    }

    #[test]
    fn test_block_shadow_does_not_affect_outer() {
        // let inside a block shadows outer variable but does not modify it on exit
        assert_eq!(interpret("let x = 1; { let x = 0; } x"), Ok(1));
    }

    #[test]
    fn test_less_than_comparison() {
        assert_eq!(interpret("let x = 0; let y = 1; x < y"), Ok(1));
    }

    #[test]
    fn test_less_equal_comparison() {
        assert_eq!(interpret("let x = 0; let y = 1; x <= y"), Ok(1));
    }

    #[test]
    fn test_greater_than_or_equal_true() {
        assert_eq!(interpret("let x = 2; let y = 1; x >= y"), Ok(1));
    }

    #[test]
    fn test_comparison_false_returns_zero() {
        assert_eq!(interpret("let x = 5; let y = 3; x < y"), Ok(0));
    }

    #[test]
    fn test_if_else_in_let_binding() {
        assert_eq!(interpret("let x = if (true) 3 else 5; x"), Ok(3));
    }

    #[test]
    fn test_if_statement_with_assignment() {
        assert_eq!(interpret("let mut x = 0; if (true) x = 3; x"), Ok(3));
    }

    #[test]
    fn test_if_block_body() {
        // Block body exercises parse_block path in parse_if_body
        assert_eq!(interpret("let mut x = 0; if (1) { x = 7; }; x"), Ok(7));
    }

    #[test]
    fn test_if_block_without_trailing_semicolon() {
        // Block body followed by expression without semicolon separator
        assert_eq!(interpret("let mut x = 0; if (true) { x = 3; } x"), Ok(3));
    }

    #[test]
    fn test_if_else_with_blocks() {
        // Exercises the else branch of parse_if_statement with block bodies
        assert_eq!(
            interpret("let mut x = 0; if (0) { x = 1; } else { x = 42; }; x"),
            Ok(42)
        );
    }

    #[test]
    fn test_if_block_else_single_statement() {
        // Block body for `if`, single-statement body for `else`
        assert_eq!(
            interpret("let mut x = 0; if (false) { x = 3; } else x = 5; x"),
            Ok(5)
        );
    }

    #[test]
    fn test_compound_add_assignment() {
        assert_eq!(interpret("let mut x = 0; x += 1; x"), Ok(1));
    }

    #[test]
    fn test_compound_add_immutable_errors() {
        // Compound assignment on an immutable variable should fail like regular reassignment
        assert!(interpret("let x = 0; x += 1; x").is_err());
    }

    #[test]
    fn test_while_loop_basic() {
        assert_eq!(interpret("let mut x = 0; while (x < 4) x += 1; x"), Ok(4));
    }

    #[test]
    fn test_while_loop_max_iterations_exceeded() {
        // Infinite loop should error after 1024 iterations
        assert!(interpret("let mut x = 0; while (1) x += 1; x").is_err());
    }

    #[test]
    fn test_while_block_body() {
        // Block body exercises parse_block path in eval_while_body_stmt
        assert_eq!(
            interpret("let mut x = 0; while (x < 3) { x += 1; }; x"),
            Ok(3)
        );
    }

    #[test]
    fn test_while_non_assignment_expression_body() {
        // Non-assignment expression body exercises the plain-expression fallback
        // path in eval_while_body_stmt; the condition itself drives termination
        // via an embedded assignment expression.
        assert!(interpret("let mut x = 3; while (x = x - 1) 1; x").is_ok());
    }

    #[test]
    fn test_for_loop_basic() {
        assert_eq!(
            interpret("let mut sum = 0; for (i in 0..4) sum += i; sum"),
            Ok(6)
        );
    }

    #[test]
    fn test_for_loop_block_body() {
        // Block body exercises parse_block path in eval_for_body_stmt
        assert_eq!(
            interpret("let mut s = 0; for (i in 1..3) { s += i * 2; }; s"),
            Ok(6)
        );
    }

    #[test]
    fn test_for_loop_max_iterations_exceeded() {
        // Range exceeding 1024 iterations should error
        assert!(interpret("let mut x = 0; for (i in 0..2000) x += 1; x").is_err());
    }

    #[test]
    fn test_for_loop_expression_body() {
        // Plain expression body exercises the parse_expression fallback path
        assert_eq!(interpret("for (i in 1..3) i + 1; 5"), Ok(5));
    }

    #[test]
    fn test_for_missing_open_paren_errors() {
        assert!(interpret("for").is_err());
    }

    #[test]
    fn test_for_missing_in_keyword_errors() {
        assert!(interpret("for (i 0..4)").is_err());
    }

    #[test]
    fn test_for_missing_range_operator_errors() {
        assert!(interpret("for (i in 0 4) i").is_err());
    }

    #[test]
    fn test_for_missing_close_paren_errors() {
        assert!(interpret("for (i in 0..4 i").is_err());
    }
}
