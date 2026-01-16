mod parser;
mod pointers;
mod repl;
mod statements;
mod validators;
mod variables;
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

    #[test]
    fn test_let_statement_type_narrowing_error() {
        assert!(interpret("let x = 100U16; let y : U8 = x; y").is_err());
    }

    #[test]
    fn test_let_mut_reassignment() {
        assert_eq!(interpret("let mut x = 0; x = 1; x"), Ok(1));
    }

    #[test]
    fn test_let_immutable_reassignment_error() {
        assert!(interpret("let x = 0; x = 1; x").is_err());
    }

    #[test]
    fn test_let_uninitialized_with_type() {
        assert_eq!(interpret("let x : I32; x = 100; x"), Ok(100));
    }

    #[test]
    fn test_let_uninitialized_without_type_error() {
        assert!(interpret("let x; x = 100; x").is_err());
    }

    #[test]
    fn test_let_uninitialized_use_before_assign_error() {
        assert!(interpret("let x : I32; x").is_err());
    }

    #[test]
    fn test_let_uninitialized_becomes_immutable_after_init() {
        assert!(interpret("let x : I32; x = 100; x = 10; x").is_err());
    }

    #[test]
    fn test_pointer_reference_and_dereference() {
        assert_eq!(interpret("let x = 100; let mut y : *I32 = &x; *y"), Ok(100));
    }

    #[test]
    fn test_pointer_reference_uninitialized_error() {
        assert!(interpret("let x : I32; let mut y : *I32 = &x; *y").is_err());
    }

    #[test]
    fn test_pointer_dereference_non_pointer_error() {
        assert!(interpret("let x = 100; *x").is_err());
    }

    #[test]
    fn test_pointer_type_annotation() {
        assert_eq!(interpret("let x = 50; let mut y : *I32 = &x; *y"), Ok(50));
    }

    #[test]
    fn test_uninitialized_reference_error() {
        assert!(interpret("let x : I32; &x").is_err());
    }

    #[test]
    fn test_mutable_pointer_assignment() {
        assert_eq!(interpret("let mut x = 0; let y = &x; *y = 100; x"), Ok(100));
    }

    #[test]
    fn test_mutable_pointer_multiple_assignments() {
        assert_eq!(
            interpret("let mut x = 5; let y = &x; *y = 10; *y = 20; x"),
            Ok(20)
        );
    }

    #[test]
    fn test_pointer_to_typed_variable() {
        assert_eq!(
            interpret("let mut x : I32 = 0; let y = &x; *y = 50; x"),
            Ok(50)
        );
    }

    #[test]
    fn test_assignment_in_block() {
        assert!(interpret("let x : I32; { x = 100; } x").is_err());
    }

    #[test]
    fn test_block_assignment_no_persist() {
        assert!(interpret("let x : I32; { x = 100; x } x").is_err());
    }

    #[test]
    fn test_block_with_literal_no_persist() {
        assert!(interpret("let x : I32; { x = 100; 7893 } x").is_err());
    }

    #[test]
    fn test_block_statement_assignment() {
        // Statement block: x remains uninitialized after the block
        // Block modifies local x, but assignment doesn't persist
        assert!(interpret("let x : I32; { x = 100; } x").is_err());
    }

    #[test]
    fn test_block_expression_as_initializer() {
        // Block expression: the block's value initializes x
        // x gets initialized to 100 (the block's return value)
        assert_eq!(interpret("let x : I32 = { 100 }; x"), Ok(100));
    }

    #[test]
    fn test_standalone_block_expression_error() {
        // Standalone block expressions are invalid - they must be used in a context
        assert!(interpret("let x = 100; { 7893 } x").is_err());
    }

    #[test]
    fn test_block_scoped_variable_inaccessible() {
        assert!(interpret("{ let x = 100; } x").is_err());
    }

    #[test]
    fn test_nested_blocks_access_outer_variables() {
        assert_eq!(
            interpret("let x = 100; { let y = 200; { let z = 300; x + y + z }}"),
            Ok(600)
        );
    }

    #[test]
    fn test_block_expression_as_initializer_no_scope_leak() {
        assert_eq!(
            interpret("let x = 100; let a = { let y = 200; { let z = 300; x + y + z }}; a"),
            Ok(600)
        );
    }

    #[test]
    fn test_block_initializer_without_final_access() {
        assert_eq!(
            interpret("let x = 100; let a = { let y = 200; { let z = 300; x + y + z }};"),
            Ok(0)
        );
    }

    #[test]
    fn test_bool_true() {
        assert_eq!(interpret("let x : Bool = true; x"), Ok(1));
    }

    #[test]
    fn test_bool_false() {
        assert_eq!(interpret("let x : Bool = false; x"), Ok(0));
    }

    #[test]
    fn test_logical_or_true_false() {
        assert_eq!(
            interpret("let x : Bool = true; let y : Bool = false; x || y"),
            Ok(1)
        );
    }

    #[test]
    fn test_logical_or_false_false() {
        assert_eq!(
            interpret("let x : Bool = false; let y : Bool = false; x || y"),
            Ok(0)
        );
    }

    #[test]
    fn test_logical_and_true_false() {
        assert_eq!(
            interpret("let x : Bool = true; let y : Bool = false; x && y"),
            Ok(0)
        );
    }

    #[test]
    fn test_logical_and_true_true() {
        assert_eq!(
            interpret("let x : Bool = true; let y : Bool = true; x && y"),
            Ok(1)
        );
    }

    #[test]
    fn test_if_true_condition() {
        assert_eq!(interpret("let x = if (true) 3 else 5; x"), Ok(3));
    }

    #[test]
    fn test_if_false_condition() {
        assert_eq!(interpret("let x = if (false) 3 else 5; x"), Ok(5));
    }

    #[test]
    fn test_if_with_logical_or() {
        assert_eq!(interpret("let x = if (true || false) 3 else 5; x"), Ok(3));
    }

    #[test]
    fn test_if_with_logical_and() {
        assert_eq!(interpret("let x = if (false && true) 3 else 5; x"), Ok(5));
    }

    #[test]
    fn test_nested_if_else() {
        assert_eq!(
            interpret("let x = if (true && false) 3 else if (false) 100 else 5; x"),
            Ok(5)
        );
    }

    #[test]
    fn test_nested_if_else_middle_branch() {
        assert_eq!(
            interpret("let x = if (false) 3 else if (true) 100 else 5; x"),
            Ok(100)
        );
    }

    #[test]
    fn test_nested_if_else_first_branch() {
        assert_eq!(
            interpret("let x = if (true) 3 else if (true) 100 else 5; x"),
            Ok(3)
        );
    }

    #[test]
    fn test_match_basic() {
        assert_eq!(
            interpret("let x = match (100) { case 100 => 5; case _ => 3; }; x"),
            Ok(5)
        );
    }

    #[test]
    fn test_match_wildcard() {
        assert_eq!(
            interpret("let x = match (50) { case 100 => 5; case _ => 3; }; x"),
            Ok(3)
        );
    }

    #[test]
    fn test_match_multiple_cases() {
        assert_eq!(
            interpret("let x = match (200) { case 100 => 5; case 200 => 10; case _ => 3; }; x"),
            Ok(10)
        );
    }

    #[test]
    fn test_match_first_match_wins() {
        assert_eq!(
            interpret("let x = match (100) { case 100 => 5; case 100 => 99; case _ => 3; }; x"),
            Ok(5)
        );
    }
}
