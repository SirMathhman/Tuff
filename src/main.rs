mod parser;
mod repl;
mod validators;
use parser::interpret;

fn main() {
    repl::run();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_100() {
        assert_eq!(interpret("100"), Ok(100));
    }

    #[test]
    fn test_interpret_100u8() {
        assert_eq!(interpret("100U8"), Ok(100));
    }

    #[test]
    fn test_interpret_negative_100u8() {
        assert!(interpret("-100U8").is_err());
    }

    #[test]
    fn test_interpret_256u8() {
        assert!(interpret("256U8").is_err());
    }

    // U8 tests
    #[test]
    fn test_u8_valid() {
        assert_eq!(interpret("255U8"), Ok(255));
    }

    #[test]
    fn test_u8_out_of_range() {
        assert!(interpret("256U8").is_err());
    }

    // U16 tests
    #[test]
    fn test_u16_valid() {
        assert_eq!(interpret("65535U16"), Ok(65535));
    }

    #[test]
    fn test_u16_out_of_range() {
        assert!(interpret("65536U16").is_err());
    }

    // U32 tests
    #[test]
    fn test_u32_valid() {
        assert_eq!(interpret("4294967295U32"), Ok(-1)); // Wraps when cast to i32
    }

    // I8 tests
    #[test]
    fn test_i8_valid() {
        assert_eq!(interpret("127I8"), Ok(127));
    }

    #[test]
    fn test_i8_out_of_range() {
        assert!(interpret("128I8").is_err());
    }

    // I16 tests
    #[test]
    fn test_i16_valid() {
        assert_eq!(interpret("32767I16"), Ok(32767));
    }

    #[test]
    fn test_i16_out_of_range() {
        assert!(interpret("32768I16").is_err());
    }

    // I32 tests
    #[test]
    fn test_i32_valid() {
        assert_eq!(interpret("2147483647I32"), Ok(2147483647));
    }

    #[test]
    fn test_i32_out_of_range() {
        assert!(interpret("2147483648I32").is_err());
    }

    // No suffix test
    #[test]
    fn test_no_suffix() {
        assert_eq!(interpret("100"), Ok(100));
    }

    // Arithmetic tests
    #[test]
    fn test_addition() {
        assert_eq!(interpret("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_addition_mixed_suffix() {
        assert_eq!(interpret("1 + 2U8"), Ok(3));
    }

    #[test]
    fn test_addition_different_types() {
        assert_eq!(interpret("1U8 + 2U16"), Ok(3));
    }

    #[test]
    fn test_addition_overflow() {
        assert!(interpret("1U8 + 65565U16").is_err());
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(interpret("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_chained_with_out_of_range() {
        assert!(interpret("1U8 + 1 + 65564U16").is_err());
    }

    #[test]
    fn test_addition_and_subtraction() {
        assert_eq!(interpret("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn test_multiplication_and_subtraction() {
        assert_eq!(interpret("2 * 3 - 4"), Ok(2));
    }

    #[test]
    fn test_operator_precedence() {
        assert_eq!(interpret("4 + 2 * 3"), Ok(10));
    }

    #[test]
    fn test_division() {
        assert_eq!(interpret("10 / 2"), Ok(5));
    }

    #[test]
    fn test_division_by_zero() {
        assert!(interpret("10 / 0").is_err());
    }

    #[test]
    fn test_parentheses() {
        assert_eq!(interpret("(4 + 2) * 3"), Ok(18));
    }

    #[test]
    fn test_curly_braces() {
        assert_eq!(interpret("(4 + { 2 }) * 3"), Ok(18));
    }

    #[test]
    fn test_variable_declaration() {
        assert_eq!(interpret("(4 + { let x : I32 = 2; x }) * 3"), Ok(18));
    }

    #[test]
    fn test_multiple_variable_declarations() {
        assert_eq!(
            interpret("(4 + { let x : I32 = 2; let y : I32 = x; y }) * 3"),
            Ok(18)
        );
    }

    #[test]
    fn test_variable_redeclaration_error() {
        assert!(interpret("(4 + { let x : I32 = 2; let x : I32 = 1; x }) * 3").is_err());
    }

    #[test]
    fn test_variable_declaration_without_type() {
        assert_eq!(interpret("(4 + { let x = 2; x }) * 3"), Ok(18));
    }

    #[test]
    fn test_nested_block_with_variable_in_expression() {
        assert_eq!(interpret("let y = (4 + { let x = 2; x }) * 3; y"), Ok(18));
    }

    #[test]
    fn test_let_statement_without_expression() {
        assert_eq!(interpret("let x = 100;"), Ok(0));
    }

    #[test]
    fn test_let_statement_type_mismatch() {
        assert!(interpret("let x : U8 = 100U16;").is_err());
    }

    #[test]
    fn test_let_statement_type_widening() {
        assert_eq!(interpret("let x : U16 = 100U8; x"), Ok(100));
    }

    #[test]
    fn test_let_statement_variable_widening() {
        assert_eq!(interpret("let x = 100U8; let y : U16 = x; y"), Ok(100));
    }
}
