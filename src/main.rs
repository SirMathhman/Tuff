#![cfg_attr(coverage_nightly, feature(coverage_attribute))]

mod lexer;
pub(crate) mod parser;
mod parser_expressions;
pub(crate) mod parser_statements;
pub(crate) mod scope;

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
    fn test_integer_uppercase_suffix_stripped() {
        assert_eq!(interpret("100U8"), Ok(100));
    }

    #[test]
    fn test_integer_u16_suffix_stripped() {
        assert_eq!(interpret("let x = 100U16;"), Ok(0));
    }

    #[test]
    fn test_integer_single_letter_suffix() {
        assert_eq!(interpret("5U + 3"), Ok(8));
    }

    #[test]
    fn test_integer_lowercase_suffix_errors() {
        assert!(interpret("100i32").is_err());
    }

    #[test]
    fn test_let_with_type_annotation() {
        assert_eq!(interpret("let x : U8 = 100U8; x"), Ok(100));
    }

    #[test]
    fn test_let_type_compat_u16_from_u8() {
        assert_eq!(interpret("let x : U16 = 100U8; x"), Ok(100));
    }

    #[test]
    fn test_let_type_mismatch_errors() {
        assert!(interpret("let x : U8 = 100U16; x").is_err());
    }

    #[test]
    fn test_let_assign_u16_var_to_u8_typed_var_errors() {
        assert!(interpret("let x = 100U16; let y : U8 = x;").is_err());
    }

    #[test]
    fn test_let_bool_var_to_u8_typed_var_errors() {
        assert!(interpret("let x : Bool = true; let y : U8 = x;").is_err());
    }

    #[test]
    fn test_is_type_check_literal_ok() {
        assert_eq!(interpret("100U8 is U8"), Ok(1));
    }

    #[test]
    fn test_is_type_check_bool_ok() {
        assert_eq!(interpret("true is Bool"), Ok(1));
    }

    #[test]
    fn test_is_type_check_var_bool_is_bool_ok() {
        assert_eq!(interpret("let x = true; x is Bool"), Ok(1));
    }

    #[test]
    fn test_is_type_check_var_bool_not_u8_fail() {
        assert_eq!(interpret("let x = true; x is U8"), Ok(0));
    }

    #[test]
    fn test_is_type_check_var_u8_is_u8_ok() {
        assert_eq!(interpret("let x = 5U8; x is U8"), Ok(1));
    }

    #[test]
    fn test_is_type_check_var_u16_not_u8_fail() {
        assert_eq!(interpret("let x = 5U16; x is U8"), Ok(0));
    }

    #[test]
    fn test_is_type_check_literal_narrow_fail() {
        assert_eq!(interpret("100U16 is U8"), Ok(0));
    }

    #[test]
    fn test_is_type_check_plain_int_ok() {
        assert_eq!(interpret("100 is I32"), Ok(1));
    }

    #[test]
    fn test_is_type_check_paren_expr_widened() {
        assert_eq!(interpret("(1U8 + 1U16) is U16"), Ok(1));
    }

    #[test]
    fn test_is_type_check_paren_expr_i16() {
        assert_eq!(interpret("(1U8 + 1U16) is I16"), Ok(1));
    }

    #[test]
    fn test_is_type_check_wider_than_target_false() {
        assert_eq!(interpret("(1U8 + 1U16) is U8"), Ok(0));
    }

    #[test]
    fn test_let_assign_u8_var_to_u16_typed_var_ok() {
        assert_eq!(interpret("let x = 50U8; let y : U16 = x; y"), Ok(50));
    }

    #[test]
    fn test_let_untyped_with_suffix_infers_type() {
        assert_eq!(interpret("let x = 42U8; x"), Ok(42));
    }

    #[test]
    fn test_let_untyped_plain_literal_ok() {
        assert_eq!(interpret("let x = 7; x"), Ok(7));
    }

    #[test]
    fn test_let_plain_literal_to_typed_var_errors() {
        assert!(interpret("let x : U8 = 5; x").is_err());
    }

    #[test]
    fn test_let_typed_with_no_rhs_token_ok() {
        assert_eq!(interpret("let x : U8 = (10U8); x"), Ok(10));
    }

    #[test]
    fn test_let_single_letter_type_suffix() {
        assert_eq!(interpret("let x : U = 5U; x"), Ok(5));
    }

    #[test]
    fn test_let_missing_type_after_colon_errors() {
        assert!(interpret("let x :").is_err());
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
    fn test_logical_or_both_false() {
        assert_eq!(interpret("false || false"), Ok(0));
    }

    #[test]
    fn test_logical_and_both_true() {
        assert_eq!(interpret("true && true"), Ok(1));
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

    #[test]
    fn test_for_loop_range_variable() {
        // Range stored in a variable and reused in for-loop
        assert_eq!(
            interpret("let mut sum = 0; let range = 0..4; for (i in range) sum += i; sum"),
            Ok(6)
        );
    }

    #[test]
    fn test_for_loop_range_variable_max_iterations() {
        // Range variable with huge span should still hit max-iterations guard
        assert!(interpret("let mut x = 0; let r = 0..2000; for (i in r) x += 1; x").is_err());
    }

    #[test]
    fn test_let_range_literal_stored() {
        // Range literal is stored as Value::Range and can be used later;
        // for-loop discards body result so trailing expression gives final value
        assert_eq!(
            interpret("let range = 2..5; for (i in range) i + 1; 9"),
            Ok(9)
        );
    }

    #[test]
    fn test_let_range_shadowed_by_int() {
        // Range variable can be shadowed by a plain int via let
        assert_eq!(interpret("let r = 0..3; let r = 7; r"), Ok(7));
    }

    #[test]
    fn test_for_loop_int_variable_not_range_errors() {
        // Using an integer variable as range should fail (get_range returns None)
        assert!(interpret("let x = 5; for (i in x) i").is_err());
    }

    #[test]
    fn test_match_basic_hit_first_arm() {
        assert_eq!(
            interpret("let x = match (100) { case 100 => 2; case _ => 3; }; x"),
            Ok(2)
        );
    }

    #[test]
    fn test_match_falls_through_to_wildcard() {
        assert_eq!(
            interpret("match (99) { case 100 => 2; case _ => 3; }"),
            Ok(3)
        );
    }

    #[test]
    fn test_match_multiple_arms_hits_second() {
        assert_eq!(
            interpret("match (2) { case 1 => 10; case 2 => 20; case _ => 99; }"),
            Ok(20)
        );
    }

    #[test]
    fn test_match_no_wildcard_unmatched_errors() {
        assert!(interpret("match (5) { case 1 => 10; case 2 => 20; }").is_err());
    }

    #[test]
    fn test_match_missing_open_paren_errors() {
        assert!(interpret("match 5 { case _ => 1; }").is_err());
    }

    #[test]
    fn test_match_missing_close_paren_errors() {
        assert!(interpret("match (5 { case _ => 1; }").is_err());
    }

    #[test]
    fn test_match_missing_open_brace_errors() {
        assert!(interpret("match (5) case _ => 1;").is_err());
    }

    #[test]
    fn test_match_missing_arrow_in_non_wildcard_arm_errors() {
        assert!(interpret("match (1) { case 1; }").is_err());
    }

    #[test]
    fn test_match_missing_arrow_in_case_errors() {
        assert!(interpret("match (5) { case ; case _ => 1; }").is_err());
    }

    #[test]
    fn test_match_missing_close_brace_errors() {
        assert!(interpret("match (5) { case _ => 1").is_err());
    }

    #[test]
    fn test_match_wildcard_missing_arrow_errors() {
        assert!(interpret("match (1) { case _ ; }").is_err());
    }

    #[test]
    fn test_fn_define_and_call() {
        assert_eq!(interpret("fn get() => 100; get()"), Ok(100));
    }

    #[test]
    fn test_fn_with_params_and_args() {
        assert_eq!(
            interpret("fn add(first : I32, second : I32) => first + second; add(25, 75)"),
            Ok(100)
        );
    }

    #[test]
    fn test_fn_with_return_type_annotation() {
        assert_eq!(
            interpret("fn add(first : I32, second : I32) : I32 => first + second; add(25, 75)"),
            Ok(100)
        );
    }

    #[test]
    fn test_fn_with_one_param() {
        assert_eq!(interpret("fn double(x : I32) => x * 2; double(49)"), Ok(98));
    }

    #[test]
    fn test_fn_return_type_missing_token_errors() {
        assert!(interpret("fn f() : ;").is_err());
    }

    #[test]
    fn test_fn_return_type_mismatch_errors() {
        assert!(interpret("fn get() : U8 => 0U16;").is_err());
    }

    #[test]
    fn test_let_with_fn_call_narrower_type_ok() {
        assert_eq!(
            interpret("fn get() : U8 => 100U8; let x : U16 = get(); x"),
            Ok(100)
        );
    }

    #[test]
    fn test_let_with_fn_call_wider_return_type_errors() {
        assert!(interpret("fn get() : U16 => 100U16; let x : U8 = get();").is_err());
    }

    #[test]
    fn test_fn_bool_param_rejects_int_arg() {
        assert!(interpret("fn pass(param : Bool) => 0; pass(100)").is_err());
    }

    #[test]
    fn test_fn_untyped_param_accepts_plain_int() {
        // (None, None) branch: untyped param + plain int arg → Ok
        assert_eq!(interpret("fn foo(x) => x; foo(5)"), Ok(5));
    }

    #[test]
    fn test_fn_untyped_param_accepts_typed_arg() {
        // (_, None) branch: typed arg passed to untyped param → Ok
        assert_eq!(interpret("fn bar(y) => y; bar(10U8)"), Ok(10));
    }

    #[test]
    fn test_fn_param_rejects_wider_type() {
        // (Some(arg_w), Some(expected_w)) if arg_w > expected_w → Err
        assert!(interpret("fn narrow(x : U8) => 0; narrow(100U16)").is_err());
    }

    #[test]
    fn test_yield_in_block() {
        assert_eq!(interpret("{ yield 2; } + 1"), Ok(3));
    }

    #[test]
    fn test_yield_inside_if_in_block() {
        // yield inside an if body should propagate up and terminate the enclosing block
        assert_eq!(interpret("{ if (true) yield 2; 5 } + 1"), Ok(3));
    }

    #[test]
    fn test_yield_inside_else_branch() {
        // yield in else branch when condition is false should also propagate up
        assert_eq!(interpret("{ if (false) 99; else yield 7; } * 2"), Ok(14));
    }

    #[test]
    fn test_return_in_nested_block_terminates_fn() {
        // return inside a nested block terminates the entire function, skipping `inner + 1`
        assert_eq!(interpret("fn get() => { let inner = { return 3 }; inner + 1 }; get()"), Ok(3));
    }

    #[test]
    fn test_yield_in_nested_block_does_not_terminate_fn() {
        // yield only exits its immediate block, so `inner` is 3 and `inner + 1` evaluates to 4
        assert_eq!(interpret("fn get() => { let inner = { yield 3 }; inner + 1 }; get()"), Ok(4));
    }
}
