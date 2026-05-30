use super::*;

/// Empty input returns zero.
#[test]
fn interpret_empty_string_returns_zero() {
    assert_eq!(interpret_tuff(""), Ok(0));
}

/// Whitespace-only input returns zero.
#[test]
fn interpret_whitespace_returns_zero() {
    assert_eq!(interpret_tuff("   "), Ok(0));
}

/// Basic U8 literal parses correctly.
#[test]
fn interpret_u8_literal() {
    assert_eq!(interpret_tuff("100U8"), Ok(100));
}

/// Negative U8 literal is rejected.
#[test]
fn interpret_negative_u8_literal() {
    assert!(interpret_tuff("-100U8").is_err());
}

/// U8 literal exceeding 255 fails.
#[test]
fn interpret_u8_literal_out_of_range() {
    assert!(interpret_tuff("256U8").is_err());
}

/// Basic U16 literal parses correctly.
#[test]
fn interpret_u16_literal() {
    assert_eq!(interpret_tuff("100U16"), Ok(100));
}

/// U16 max value (65535) is accepted.
#[test]
fn interpret_u16_literal_max() {
    assert_eq!(interpret_tuff("65535U16"), Ok(65535));
}

/// Negative U16 literal is rejected.
#[test]
fn interpret_negative_u16_literal() {
    assert!(interpret_tuff("-1U16").is_err());
}

/// U16 literal exceeding 65535 fails.
#[test]
fn interpret_u16_literal_out_of_range() {
    assert!(interpret_tuff("65536U16").is_err());
}

/// Basic U32 literal parses correctly.
#[test]
fn interpret_u32_literal() {
    assert_eq!(interpret_tuff("100U32"), Ok(100));
}

/// U32 max value is accepted.
#[test]
fn interpret_u32_literal_max() {
    assert_eq!(interpret_tuff("4294967295U32"), Ok(4294967295));
}

/// Negative U32 literal is rejected.
#[test]
fn interpret_negative_u32_literal() {
    assert!(interpret_tuff("-1U32").is_err());
}

/// U32 literal exceeding max fails.
#[test]
fn interpret_u32_literal_out_of_range() {
    assert!(interpret_tuff("4294967296U32").is_err());
}

/// Basic U64 literal parses correctly.
#[test]
fn interpret_u64_literal() {
    assert_eq!(interpret_tuff("100U64"), Ok(100));
}

/// U64 value at i64::MAX is accepted.
#[test]
fn interpret_u64_literal_max_i64() {
    assert_eq!(
        interpret_tuff("9223372036854775807U64"),
        Ok(9223372036854775807)
    );
}

/// Negative U64 literal is rejected.
#[test]
fn interpret_negative_u64_literal() {
    assert!(interpret_tuff("-1U64").is_err());
}

/// U64 exceeding i64::MAX fails.
#[test]
fn interpret_u64_literal_exceeds_i64() {
    assert!(interpret_tuff("9223372036854775808U64").is_err());
}

/// Negative I8 literal parses correctly.
#[test]
fn interpret_i8_literal_negative() {
    assert_eq!(interpret_tuff("-100I8"), Ok(-100));
}

/// Positive I8 literal parses correctly.
#[test]
fn interpret_i8_literal_positive() {
    assert_eq!(interpret_tuff("100I8"), Ok(100));
}

/// I8 min value (-128) is accepted.
#[test]
fn interpret_i8_literal_min() {
    assert_eq!(interpret_tuff("-128I8"), Ok(-128));
}

/// I8 max value (127) is accepted.
#[test]
fn interpret_i8_literal_max() {
    assert_eq!(interpret_tuff("127I8"), Ok(127));
}

/// I8 below -128 fails.
#[test]
fn interpret_i8_literal_out_of_range_negative() {
    assert!(interpret_tuff("-129I8").is_err());
}

/// I8 above 127 fails.
#[test]
fn interpret_i8_literal_out_of_range_positive() {
    assert!(interpret_tuff("128I8").is_err());
}

/// Large negative I8 value fails.
#[test]
fn interpret_i8_literal_out_of_range_large_negative() {
    assert!(interpret_tuff("-200I8").is_err());
}

/// Simple U8 addition works.
#[test]
fn interpret_addition_u8() {
    assert_eq!(interpret_tuff("1U8 + 2U8"), Ok(3));
}

/// Three-term U8 addition works.
#[test]
fn interpret_addition_u8_three_terms() {
    assert_eq!(interpret_tuff("1U8 + 2U8 + 3U8"), Ok(6));
}

/// U8 addition that overflows fails.
#[test]
fn interpret_addition_u8_overflow() {
    assert!(interpret_tuff("1U8 + 255U8").is_err());
}

/// Mixed-type addition uses widest bounds.
#[test]
fn interpret_addition_mixed_types() {
    assert_eq!(interpret_tuff("1U8 + 255U16"), Ok(256));
}

/// U8 subtraction works.
#[test]
fn interpret_subtraction_u8() {
    assert_eq!(interpret_tuff("3U8 + 2U8 - 4U8"), Ok(1));
}

/// Multiplication with subtraction respects precedence.
#[test]
fn interpret_multiplication_u8() {
    assert_eq!(interpret_tuff("3U8 * 2U8 - 4U8"), Ok(2));
}

/// Multiplication binds tighter than addition.
#[test]
fn interpret_precedence_mul_before_add() {
    assert_eq!(interpret_tuff("3U8 + 2U8 * 4U8"), Ok(11));
}

/// Unsigned underflow is detected.
#[test]
fn interpret_unsigned_underflow() {
    assert!(interpret_tuff("1U8 - 2U8").is_err());
}

/// Unsigned multiplication overflow is detected.
#[test]
fn interpret_unsigned_mul_overflow() {
    assert!(interpret_tuff("100U8 * 200U8").is_err());
}

/// Signed multiplication that overflows fails.
#[test]
fn interpret_signed_mul_overflow_negative() {
    assert!(interpret_tuff("100I8 * -2I8").is_err());
}

/// Integer division works.
#[test]
fn interpret_division_u8() {
    assert_eq!(interpret_tuff("10U8 / 3U8"), Ok(3));
}

/// Modulo operator works.
#[test]
fn interpret_modulo_u8() {
    assert_eq!(interpret_tuff("10U8 % 3U8"), Ok(1));
}

/// Parenthesized expressions evaluate correctly.
#[test]
fn interpret_parentheses() {
    assert_eq!(interpret_tuff("(3U8 + 2U8) * 4U8"), Ok(20));
}

/// Block expressions work inside larger expressions.
#[test]
fn interpret_curly_braces() {
    assert_eq!(interpret_tuff("{ 3U8 + 2U8 } * 4U8"), Ok(20));
}

/// `let` binding in a block works.
#[test]
fn interpret_let_binding() {
    assert_eq!(
        interpret_tuff("{ let x : U8 = 3U8 + 2U8; x } * 4U8"),
        Ok(20)
    );
}

/// Nested `let` binding works.
#[test]
fn interpret_nested_let_binding() {
    assert_eq!(
        interpret_tuff("let y : U8 = { let x : U8 = 3U8 + 2U8; x } * 4U8; y"),
        Ok(20)
    );
}

/// Trailing semicolon on top-level statement returns zero.
#[test]
fn interpret_let_trailing_semicolon() {
    assert_eq!(
        interpret_tuff("let y : U8 = { let x : U8 = 3U8 + 2U8; x } * 4U8;"),
        Ok(0)
    );
}

/// `let` without type annotation infers bounds.
#[test]
fn interpret_let_without_type_annotation() {
    assert_eq!(interpret_tuff("let y = 100U8; y"), Ok(100));
}

/// Shadowing a variable with `let` works.
#[test]
fn interpret_let_shadowing() {
    assert_eq!(interpret_tuff("let y = 100U8; let y = 200U8; y"), Ok(200));
}

/// Type mismatch on `let` with annotation fails.
#[test]
fn interpret_let_type_mismatch() {
    assert!(interpret_tuff("let y : U8 = 100U16;").is_err());
}

/// Type mismatch when assigning variable to narrower type fails.
#[test]
fn interpret_let_type_mismatch_var() {
    assert!(interpret_tuff("let y = 0U16; let x : U8 = y;").is_err());
}

/// Mutable assignment works.
#[test]
fn interpret_assignment() {
    assert_eq!(interpret_tuff("let mut x = 0U8; x = 1U8; x"), Ok(1));
}

/// Assignment to immutable variable fails.
#[test]
fn interpret_assignment_immutable() {
    assert!(interpret_tuff("let x = 0U8; x = 1U8; x").is_err());
}

/// Assignment with type mismatch fails.
#[test]
fn interpret_assignment_type_mismatch() {
    assert!(interpret_tuff("let mut x = 0U8; x = 1U16; x").is_err());
}

/// Boolean `true` literal works.
#[test]
fn interpret_bool_literal() {
    assert_eq!(interpret_tuff("let x : Bool = true; x"), Ok(1));
}

/// Boolean `false` literal works.
#[test]
fn interpret_bool_literal_false() {
    assert_eq!(interpret_tuff("let x : Bool = false; x"), Ok(0));
}

/// Logical OR (`||`) short-circuits correctly.
#[test]
fn interpret_logical_or() {
    assert_eq!(interpret_tuff("let x = true; let y = false; x || y"), Ok(1));
}

/// Logical AND (`&&`) evaluates correctly.
#[test]
fn interpret_logical_and() {
    assert_eq!(interpret_tuff("let x = true; let y = false; x && y"), Ok(0));
}
