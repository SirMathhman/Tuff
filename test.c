#include <assert.h>
#include <stdio.h>
#include "interpret.h"

static void assert_success(const char *input, int expected_value, const char *test_name)
{
    printf("Testing %s...\n", test_name);
    InterpretResult result = interpret(input);
    if (result.has_error)
    {
        printf("ERROR in %s: %s\n", test_name, result.error_message);
    }
    assert(!result.has_error);
    assert(result.value == expected_value);
    printf("✓ %s passed\n", test_name);
}

static void assert_error(const char *input, const char *test_name)
{
    printf("Testing %s...\n", test_name);
    InterpretResult result = interpret(input);
    assert(result.has_error);
    printf("✓ %s passed\n", test_name);
}

void test_interpret_empty_string(void)
{
    assert_success("", 0, "test_interpret_empty_string");
}

void test_interpret_one_hundred(void)
{
    assert_success("100", 100, "test_interpret_one_hundred");
}

void test_interpret_one_hundred_u8(void)
{
    assert_success("100U8", 100, "test_interpret_one_hundred_u8");
}

void test_interpret_negative_u8(void)
{
    assert_error("-100U8", "test_interpret_negative_u8");
}

void test_interpret_negative_i8(void)
{
    assert_success("-100I8", -100, "test_interpret_negative_i8");
}

void test_interpret_out_of_range_u8(void)
{
    assert_error("256U8", "test_interpret_out_of_range_u8");
}

void test_interpret_addition(void)
{
    assert_success("1U8 + 2U8", 3, "test_interpret_addition");
}

void test_interpret_mixed_types(void)
{
    assert_success("1U8 + 2", 3, "test_interpret_mixed_types");
}

void test_interpret_overflow(void)
{
    assert_error("1U8 + 255U8", "test_interpret_overflow");
}

void test_interpret_overflow_untyped(void)
{
    assert_error("1U8 + 255", "test_interpret_overflow_untyped");
}

void test_interpret_mixed_type_sizes(void)
{
    assert_success("1U8 + 255U16", 256, "test_interpret_mixed_type_sizes");
}

void test_interpret_overflow_right_typed(void)
{
    assert_error("1 + 255U8", "test_interpret_overflow_right_typed");
}

void test_interpret_chained_mixed_types(void)
{
    assert_success("1U8 + 255 + 1U16", 257, "test_interpret_chained_mixed_types");
}

void test_interpret_chained_overflow(void)
{
    assert_error("1U8 + 65534 + 1U16", "test_interpret_chained_overflow");
}

void test_interpret_subtraction(void)
{
    assert_success("2 + 3 - 4", 1, "test_interpret_subtraction");
}

void test_interpret_multiplication(void)
{
    assert_success("2 * 3 - 4", 2, "test_interpret_multiplication");
}

void test_interpret_precedence(void)
{
    assert_success("2 + 3 * 4", 14, "test_interpret_precedence");
}

void test_interpret_parentheses(void)
{
    assert_success("(2 + 3) * 4", 20, "test_interpret_parentheses");
}

void test_interpret_curly_braces(void)
{
    assert_success("(2 + { 3 }) * 4", 20, "test_interpret_curly_braces");
}

void test_interpret_variable_declaration(void)
{
    assert_success("(2 + { let x : U8 = 3; x }) * 4", 20, "test_interpret_variable_declaration");
}

void test_interpret_multiple_variable_declarations(void)
{
    assert_success("(2 + { let x : U8 = 3; let y : U8 = x; y }) * 4", 20, "test_interpret_multiple_variable_declarations");
}

void test_interpret_top_level_variable_declaration(void)
{
    assert_success("let z : U8 = (2 + { let x : U8 = 3; let y : U8 = x; y }) * 4; z", 20, "test_interpret_top_level_variable_declaration");
}

void test_interpret_typeless_variable_declaration(void)
{
    assert_success("let x = 100; x", 100, "test_interpret_typeless_variable_declaration");
}

void test_interpret_duplicate_variable_declaration(void)
{
    assert_error("let x = 100; let x = 100; x", "test_interpret_duplicate_variable_declaration");
}

void test_interpret_variable_type_mismatch(void)
{
    assert_error("let x : U8 = 100U16; x", "test_interpret_variable_type_mismatch");
}

void test_interpret_variable_type_compatible(void)
{
    assert_success("let x : U16 = 100U8; x", 100, "test_interpret_variable_type_compatible");
}

void test_interpret_variable_assignment_type_check(void)
{
    assert_error("let x = 100U16; let y : U8 = x; y", "test_interpret_variable_assignment_type_check");
}

void test_interpret_mutable_variable(void)
{
    assert_success("let mut x = 0; x = 100; x", 100, "test_interpret_mutable_variable");
}

void test_interpret_immutable_variable_reassignment(void)
{
    assert_error("let x = 0; x = 100; x", "test_interpret_immutable_variable_reassignment");
}

void test_interpret_undeclared_variable_assignment(void)
{
    assert_error("x = 100; x", "test_interpret_undeclared_variable_assignment");
}

void test_interpret_mutable_variable_type_mismatch(void)
{
    assert_error("let mut x : U8 = 0; x = 100U16; x", "test_interpret_mutable_variable_type_mismatch");
}

void test_interpret_empty_block_variable_access(void)
{
    assert_success("let x = 100; {} x", 100, "test_interpret_empty_block_variable_access");
}

int main(void)
{
    printf("Running tests...\n");
    test_interpret_empty_string();
    test_interpret_one_hundred();
    test_interpret_one_hundred_u8();
    test_interpret_negative_u8();
    test_interpret_negative_i8();
    test_interpret_out_of_range_u8();
    test_interpret_addition();
    test_interpret_mixed_types();
    test_interpret_overflow();
    test_interpret_overflow_untyped();
    test_interpret_mixed_type_sizes();
    test_interpret_overflow_right_typed();
    test_interpret_chained_mixed_types();
    test_interpret_chained_overflow();
    test_interpret_subtraction();
    test_interpret_multiplication();
    test_interpret_precedence();
    test_interpret_parentheses();
    test_interpret_curly_braces();
    test_interpret_variable_declaration();
    test_interpret_multiple_variable_declarations();
    test_interpret_top_level_variable_declaration();
    test_interpret_typeless_variable_declaration();
    test_interpret_duplicate_variable_declaration();
    test_interpret_variable_type_mismatch();
    test_interpret_variable_type_compatible();
    test_interpret_variable_assignment_type_check();
    test_interpret_mutable_variable();
    test_interpret_immutable_variable_reassignment();
    test_interpret_undeclared_variable_assignment();
    test_interpret_mutable_variable_type_mismatch();
    test_interpret_empty_block_variable_access();
    printf("All tests passed!\n");
    return 0;
}
