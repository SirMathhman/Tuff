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
