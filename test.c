#include <assert.h>
#include <stdio.h>
#include "interpret.h"

static void assert_success(const char *input, int expected_value, const char *test_name)
{
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
    printf("All tests passed!\n");
    return 0;
}
