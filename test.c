#include <assert.h>
#include <stdio.h>
#include "interpret.h"

static int passed_asserts = 0;
static int total_asserts = 0;

static void assert_success(const char *input, int expected_value, const char *test_name)
{
    total_asserts++;
    InterpretResult result = interpret(input);
    if (result.has_error)
    {
        printf("'%s' failed!\n", test_name);
        printf("ERROR in '%s': %s\n", test_name, result.error_message);
    }
    assert(!result.has_error);

    if (result.value != expected_value)
    {
        printf("'%s' failed!\n", test_name);
        printf("ERROR in '%s': Expected value %d but got %d\n", test_name, expected_value, result.value);
    }
    assert(result.value == expected_value);
    passed_asserts++;
}

static void assert_error(const char *input, const char *test_name)
{
    total_asserts++;
    InterpretResult result = interpret(input);
    if (!result.has_error)
    {
        printf("'%s' failed!\n", test_name);
        printf("ERROR in '%s': Expected error but got value %d\n", test_name, result.value);
    }
    assert(result.has_error);
    passed_asserts++;
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

void test_interpret_immutable_variable_compound_assignment(void)
{
    assert_error("let x = 0; x += 1; x", "test_interpret_immutable_variable_compound_assignment");
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

void test_interpret_empty_block_before_let(void)
{
    assert_success("{} let x = 100; x", 100, "test_interpret_empty_block_before_let");
}

void test_interpret_mutable_variable_block_mutation(void)
{
    assert_success("let mut x = 0; { x = 100; } x", 100, "test_interpret_mutable_variable_block_mutation");
}

void test_interpret_compound_assignment_plus(void)
{
    assert_success("let mut x = 5; x += 3; x", 8, "test_interpret_compound_assignment_plus");
}

void test_interpret_compound_assignment_minus(void)
{
    assert_success("let mut x = 10; x -= 3; x", 7, "test_interpret_compound_assignment_minus");
}

void test_interpret_compound_assignment_multiply(void)
{
    assert_success("let mut x = 4; x *= 2; x", 8, "test_interpret_compound_assignment_multiply");
}

void test_interpret_compound_assignment_divide(void)
{
    assert_success("let mut x = 20; x /= 4; x", 5, "test_interpret_compound_assignment_divide");
}

void test_interpret_let_statement_no_expression(void)
{
    assert_success("let x = 100;", 0, "test_interpret_let_statement_no_expression");
}

void test_interpret_block_let_statement_no_expression(void)
{
    assert_success("{ let x = 100; }", 0, "test_interpret_block_let_statement_no_expression");
}

void test_interpret_block_then_let_and_expression(void)
{
    assert_success("{ let x = 100; } let y = 100; y", 100, "test_interpret_block_then_let_and_expression");
}

void test_interpret_block_x_then_toplevel_x(void)
{
    assert_error("{ let x = 100; } let x = 100;", "test_interpret_block_x_then_toplevel_x");
}

void test_interpret_nested_blocks_x_then_toplevel_x(void)
{
    assert_error("{{ let x = 100; }} let x = 100;", "test_interpret_nested_blocks_x_then_toplevel_x");
}

void test_interpret_bool_true(void)
{
    assert_success("let x : Bool = true; x", 1, "test_interpret_bool_true");
}

void test_interpret_bool_or_operator(void)
{
    assert_success("let x = true; let y = false; x || y", 1, "test_interpret_bool_or_operator");
}

void test_interpret_bool_and_operator(void)
{
    assert_success("let x = true; let y = false; x && y", 0, "test_interpret_bool_and_operator");
}

void test_interpret_and_operator_numeric_types_error(void)
{
    assert_error("1 && 2", "test_interpret_and_operator_numeric_types_error");
}

void test_interpret_bool_addition_type_error(void)
{
    assert_error("true + false", "test_interpret_bool_addition_type_error");
}

void test_interpret_bool_compound_assignment_error(void)
{
    assert_error("let mut x = true; x += 1; x", "test_interpret_bool_compound_assignment_error");
}

void test_interpret_if_else_expression(void)
{
    assert_success("let x = if (true) 3 else 5; x", 3, "test_interpret_if_else_expression");
}

void test_interpret_if_else_numeric_condition_error(void)
{
    assert_error("let x = if (100) 3 else 5; x", "test_interpret_if_else_numeric_condition_error");
}

void test_interpret_if_else_branch_type_mismatch_error(void)
{
    assert_error("if (100) 3 else true", "test_interpret_if_else_branch_type_mismatch_error");
}

void test_interpret_if_else_branch_types_must_match_error(void)
{
    assert_error("if (true) 3 else true", "test_interpret_if_else_branch_types_must_match_error");
}

void test_interpret_if_else_bool_var_numeric_branches_error(void)
{
    assert_error("let x : Bool = if (true) 3 else 5; x", "test_interpret_if_else_bool_var_numeric_branches_error");
}

void test_interpret_nested_if_else(void)
{
    assert_success("if (false) 1 else if (false) 2 else 3", 3, "test_interpret_nested_if_else");
}

void test_interpret_if_else_with_assignments(void)
{
    assert_success("let mut x = 0; if (true) x = 1; else x = 2; x", 1, "test_interpret_if_else_with_assignments");
}

void test_interpret_block_with_if_else_assignments(void)
{
    assert_success("let mut x = 0; { if (true) x = 1; else x = 2; } x", 1, "test_interpret_block_with_if_else_assignments");
}

void test_interpret_if_without_else(void)
{
    assert_success("let mut x = 0; if (true) x = 1; x", 1, "test_interpret_if_without_else");
}

void test_interpret_if_without_else_false(void)
{
    assert_success("let mut x = 2; if (false) x = 1; x", 2, "test_interpret_if_without_else_false");
}

void test_interpret_less_than_true(void)
{
    assert_success("let x = 0; let y = 1; x < y", 1, "test_interpret_less_than_true");
}

void test_interpret_less_than_false(void)
{
    assert_success("let x = 1; let y = 0; x < y", 0, "test_interpret_less_than_false");
}

void test_interpret_less_than_equal(void)
{
    assert_success("let x = 1; let y = 1; x < y", 0, "test_interpret_less_than_equal");
}

void test_interpret_greater_than_true(void)
{
    assert_success("let x = 1; let y = 0; x > y", 1, "test_interpret_greater_than_true");
}

void test_interpret_greater_than_false(void)
{
    assert_success("let x = 0; let y = 1; x > y", 0, "test_interpret_greater_than_false");
}

void test_interpret_less_equal_true(void)
{
    assert_success("let x = 0; let y = 1; x <= y", 1, "test_interpret_less_equal_true");
}

void test_interpret_less_equal_equal(void)
{
    assert_success("let x = 1; let y = 1; x <= y", 1, "test_interpret_less_equal_equal");
}

void test_interpret_greater_equal_true(void)
{
    assert_success("let x = 1; let y = 0; x >= y", 1, "test_interpret_greater_equal_true");
}

void test_interpret_greater_equal_equal(void)
{
    assert_success("let x = 1; let y = 1; x >= y", 1, "test_interpret_greater_equal_equal");
}

void test_interpret_equal_true(void)
{
    assert_success("let x = 1; let y = 1; x == y", 1, "test_interpret_equal_true");
}

void test_interpret_equal_false(void)
{
    assert_success("let x = 1; let y = 2; x == y", 0, "test_interpret_equal_false");
}

void test_interpret_not_equal_true(void)
{
    assert_success("let x = 1; let y = 2; x != y", 1, "test_interpret_not_equal_true");
}

void test_interpret_not_equal_false(void)
{
    assert_success("let x = 1; let y = 1; x != y", 0, "test_interpret_not_equal_false");
}

void test_interpret_bool_comparison_error(void)
{
    assert_error("true < false", "test_interpret_bool_comparison_error");
}

void test_interpret_match_basic(void)
{
    assert_success("let x = match (100) { case 100 => 2; case _ => 3; }; x", 2, "test_interpret_match_basic");
}

void test_interpret_match_wildcard_default(void)
{
    assert_success("let x = match (50) { case 100 => 2; case _ => 3; }; x", 3, "test_interpret_match_wildcard_default");
}

void test_interpret_match_multiple_cases(void)
{
    assert_success("let x = match (2) { case 1 => 10; case 2 => 20; case 3 => 30; case _ => 0; }; x", 20, "test_interpret_match_multiple_cases");
}

void test_interpret_match_no_match_error(void)
{
    assert_error("let x = match (100) { case 1 => 2; case 2 => 3; }; x", "test_interpret_match_no_match_error");
}

void test_interpret_match_without_wildcard(void)
{
    assert_success("let x = match (100) { case 100 => 2; }; x", 2, "test_interpret_match_without_wildcard");
}

void test_interpret_match_bool_value_numeric_patterns_error(void)
{
    assert_error("let x = match (true) { case 100 => 2; case _ => 3; }; x", "test_interpret_match_bool_value_numeric_patterns_error");
}

void test_interpret_match_numeric_value_bool_patterns_error(void)
{
    assert_error("let x = match (100) { case true => 2; case _ => 3; }; x", "test_interpret_match_numeric_value_bool_patterns_error");
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
    test_interpret_immutable_variable_compound_assignment();
    test_interpret_undeclared_variable_assignment();
    test_interpret_mutable_variable_type_mismatch();
    test_interpret_empty_block_variable_access();
    test_interpret_empty_block_before_let();
    test_interpret_mutable_variable_block_mutation();
    test_interpret_compound_assignment_plus();
    test_interpret_compound_assignment_minus();
    test_interpret_compound_assignment_multiply();
    test_interpret_compound_assignment_divide();
    test_interpret_let_statement_no_expression();
    test_interpret_block_let_statement_no_expression();
    test_interpret_block_then_let_and_expression();
    test_interpret_block_x_then_toplevel_x();
    test_interpret_nested_blocks_x_then_toplevel_x();
    test_interpret_bool_true();
    test_interpret_bool_or_operator();
    test_interpret_bool_and_operator();
    test_interpret_and_operator_numeric_types_error();
    test_interpret_bool_addition_type_error();
    test_interpret_bool_compound_assignment_error();
    test_interpret_if_else_expression();
    test_interpret_if_else_numeric_condition_error();
    test_interpret_if_else_branch_type_mismatch_error();
    test_interpret_if_else_branch_types_must_match_error();
    test_interpret_if_else_bool_var_numeric_branches_error();
    test_interpret_nested_if_else();
    test_interpret_if_else_with_assignments();
    test_interpret_block_with_if_else_assignments();
    test_interpret_if_without_else();
    test_interpret_if_without_else_false();
    test_interpret_less_than_true();
    test_interpret_less_than_false();
    test_interpret_less_than_equal();
    test_interpret_greater_than_true();
    test_interpret_greater_than_false();
    test_interpret_less_equal_true();
    test_interpret_less_equal_equal();
    test_interpret_greater_equal_true();
    test_interpret_greater_equal_equal();
    test_interpret_equal_true();
    test_interpret_equal_false();
    test_interpret_not_equal_true();
    test_interpret_not_equal_false();
    test_interpret_bool_comparison_error();
    test_interpret_match_basic();
    test_interpret_match_wildcard_default();
    test_interpret_match_multiple_cases();
    test_interpret_match_no_match_error();
    test_interpret_match_without_wildcard();
    test_interpret_match_bool_value_numeric_patterns_error();
    test_interpret_match_numeric_value_bool_patterns_error();

    if (passed_asserts == total_asserts)
    {
        printf("All %d tests passed!\n", passed_asserts);
    }
    else
    {
        printf("%d out of %d tests passed.\n", passed_asserts, total_asserts);
    }
    return 0;
}
