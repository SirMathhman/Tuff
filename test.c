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
    else if (result.value != expected_value)
    {
        printf("'%s' failed!\n", test_name);
        printf("ERROR in '%s': Expected value %d but got %d\n", test_name, expected_value, result.value);
    }
    else
    {
        passed_asserts++;
    }
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
    else
    {
        passed_asserts++;
    }
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

void test_interpret_untyped_to_i32(void)
{
    assert_success("let x = 0; let y : I32 = x; y", 0, "test_interpret_untyped_to_i32");
}

void test_interpret_untyped_to_u8_error(void)
{
    assert_error("let x = 0; let y : U8 = x; y", "test_interpret_untyped_to_u8_error");
}

void test_interpret_untyped_to_i8_error(void)
{
    assert_error("let x = 0; let y : I8 = x; y", "test_interpret_untyped_to_i8_error");
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

void test_interpret_compound_assignment_type_overflow(void)
{
    assert_error("let mut x : U8 = 1; x += 255; x", "test_interpret_compound_assignment_type_overflow");
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

void test_interpret_while_loop_increment(void)
{
    assert_success("let mut i = 0; while (i < 4) i += 1; i", 4, "test_interpret_while_loop_increment");
}

void test_interpret_while_loop_decrement(void)
{
    assert_success("let mut i = 5; while (i > 0) i -= 1; i", 0, "test_interpret_while_loop_decrement");
}

void test_interpret_while_loop_false_condition(void)
{
    assert_success("let mut i = 0; while (false) i += 1; i", 0, "test_interpret_while_loop_false_condition");
}

void test_interpret_while_loop_without_final_expression(void)
{
    assert_success("let mut i = 0; while (i < 3) i += 1;", 0, "test_interpret_while_loop_without_final_expression");
}

void test_interpret_while_loop_numeric_condition_error(void)
{
    assert_error("let mut i = 0; while (1) i += 1; i", "test_interpret_while_loop_numeric_condition_error");
}

void test_interpret_while_loop_with_multiplication(void)
{
    assert_success("let mut i = 1; while (i < 16) i *= 2; i", 16, "test_interpret_while_loop_with_multiplication");
}

void test_interpret_while_loop_multiple_conditions(void)
{
    assert_success("let mut i = 0; let mut j = 10; while (i < 5) { i += 1; j -= 1; } j", 5, "test_interpret_while_loop_multiple_conditions");
}

void test_interpret_for_loop_sum(void)
{
    assert_success("let mut sum = 0; for (i in 0..10) sum += i; sum", 45, "test_interpret_for_loop_sum");
}

void test_interpret_for_loop_single_iteration(void)
{
    assert_success("let mut count = 0; for (i in 0..1) count += 1; count", 1, "test_interpret_for_loop_single_iteration");
}

void test_interpret_for_loop_no_iterations(void)
{
    assert_success("let mut count = 0; for (i in 0..0) count += 1; count", 0, "test_interpret_for_loop_no_iterations");
}

void test_interpret_for_loop_negative_range(void)
{
    assert_success("let mut sum = 0; for (i in -5..5) sum += i; sum", -5, "test_interpret_for_loop_negative_range");
}

void test_interpret_for_loop_large_range(void)
{
    assert_success("let mut product = 1; for (i in 2..5) product *= i; product", 24, "test_interpret_for_loop_large_range");
}

void test_interpret_for_loop_without_final_expression(void)
{
    assert_success("let mut i = 0; for (j in 0..3) i += 1;", 0, "test_interpret_for_loop_without_final_expression");
}

void test_interpret_for_loop_variable_assignment_error(void)
{
    assert_error("for (i in 0..5) i = 10;", "test_interpret_for_loop_variable_assignment_error");
}

void test_interpret_for_loop_variable_compound_assignment_error(void)
{
    assert_error("for (i in 0..5) i += 1;", "test_interpret_for_loop_variable_compound_assignment_error");
}

void test_interpret_for_loop_variable_shadowing_error(void)
{
    assert_error("let i = 0; for (i in 0..5) { }", "test_interpret_for_loop_variable_shadowing_error");
}

void test_interpret_for_loop_nested_shadowing_error(void)
{
    assert_error("for (i in 0..5) { for (i in 0..3) { } }", "test_interpret_for_loop_nested_shadowing_error");
}

void test_interpret_for_loop_missing_in_keyword_error(void)
{
    assert_error("for (i to 0..5) { }", "test_interpret_for_loop_missing_in_keyword_error");
}

void test_interpret_pointer_basic(void)
{
    assert_success("let x = 100; let y : *I32 = &x; *y", 100, "test_interpret_pointer_basic");
}

void test_interpret_pointer_mutable_dereference_assign(void)
{
    assert_success("let mut x = 100; let y : *mut I32 = &mut x; *y = 200; x", 200, "test_interpret_pointer_mutable_dereference_assign");
}

void test_interpret_pointer_immutable_dereference_assign_error(void)
{
    assert_error("let x = 100; let y : *I32 = &x; *y = 200; x", "test_interpret_pointer_immutable_dereference_assign_error");
}

void test_interpret_pointer_type_mismatch_error(void)
{
    assert_error("let x : U8 = 100; let y : *I32 = &x;", "test_interpret_pointer_type_mismatch_error");
}

void test_interpret_pointer_dereference_non_pointer_error(void)
{
    assert_error("let x = 100; *x", "test_interpret_pointer_dereference_non_pointer_error");
}

void test_interpret_mutable_pointer(void)
{
    assert_success("let mut x = 0; let y : *mut I32 = &mut x; *y = 100; x", 100, "test_interpret_mutable_pointer");
}

void test_interpret_immutable_pointer_dereference_assign_error(void)
{
    assert_error("let mut x = 100; let y : *I32 = &x; *y = 200; x", "test_interpret_immutable_pointer_dereference_assign_error");
}

void test_interpret_array_indexing(void)
{
    assert_success("let array : [I32; 3; 3] = [1, 2, 3]; array[0] + array[1] + array[2]", 6, "test_interpret_array_indexing");
}

void test_interpret_function_declaration(void)
{
    assert_success("fn empty() : Void => {}", 0, "test_interpret_function_declaration");
}

void test_interpret_duplicate_function_declaration(void)
{
    assert_error("fn empty() : Void => {} fn empty() : Void => {}", "test_interpret_duplicate_function_declaration");
}

void test_interpret_function_with_parameters(void)
{
    assert_success("fn empty(x : I32, y : I32) : Void => {}", 0, "test_interpret_function_with_parameters");
}

void test_interpret_function_duplicate_parameter_names(void)
{
    assert_error("fn empty(x : I32, x : I32) : Void => {}", "test_interpret_function_duplicate_parameter_names");
}

void test_interpret_function_invocation(void)
{
    assert_success("fn add(first : I32, second : I32) : I32 => { first + second } add(3, 4)", 7, "test_interpret_function_invocation");
}

void test_interpret_function_argument_count_mismatch(void)
{
    assert_error("fn add(first : I32, second : I32) : I32 => { first + second } add()", "test_interpret_function_argument_count_mismatch");
}

void test_interpret_function_argument_type_mismatch(void)
{
    assert_error("fn add(first : I32, second : I32) : I32 => { first + second } add(1, true)", "test_interpret_function_argument_type_mismatch");
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
    test_interpret_untyped_to_i32();
    test_interpret_untyped_to_u8_error();
    test_interpret_untyped_to_i8_error();
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
    test_interpret_compound_assignment_type_overflow();
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
    test_interpret_while_loop_increment();
    test_interpret_while_loop_decrement();
    test_interpret_while_loop_false_condition();
    test_interpret_while_loop_without_final_expression();
    test_interpret_while_loop_numeric_condition_error();
    test_interpret_while_loop_with_multiplication();
    test_interpret_while_loop_multiple_conditions();
    test_interpret_for_loop_sum();
    test_interpret_for_loop_single_iteration();
    test_interpret_for_loop_no_iterations();
    test_interpret_for_loop_negative_range();
    test_interpret_for_loop_large_range();
    test_interpret_for_loop_without_final_expression();
    test_interpret_for_loop_variable_assignment_error();
    test_interpret_for_loop_variable_compound_assignment_error();
    test_interpret_for_loop_variable_shadowing_error();
    test_interpret_for_loop_nested_shadowing_error();
    test_interpret_for_loop_missing_in_keyword_error();
    test_interpret_pointer_basic();
    test_interpret_pointer_mutable_dereference_assign();
    test_interpret_pointer_immutable_dereference_assign_error();
    test_interpret_pointer_type_mismatch_error();
    test_interpret_pointer_dereference_non_pointer_error();
    test_interpret_mutable_pointer();
    test_interpret_immutable_pointer_dereference_assign_error();
    test_interpret_array_indexing();
    test_interpret_function_declaration();
    test_interpret_duplicate_function_declaration();
    test_interpret_function_with_parameters();
    test_interpret_function_duplicate_parameter_names();
    test_interpret_function_invocation();
    test_interpret_function_argument_count_mismatch();
    test_interpret_function_argument_type_mismatch();

    if (passed_asserts == total_asserts)
    {
        printf("All %d tests passed!\n", passed_asserts);
        return 0;
    }
    else
    {
        printf("%d out of %d tests passed.\n", passed_asserts, total_asserts);
        return -1;
    }
}
