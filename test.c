#include <assert.h>
#include <stdio.h>
#include "interpret.h"

void test_interpret_empty_string(void)
{
    InterpretResult result = interpret("");
    assert(!result.has_error);
    assert(result.value == 0);
    printf("✓ test_interpret_empty_string passed\n");
}

void test_interpret_one_hundred(void)
{
    InterpretResult result = interpret("100");
    assert(!result.has_error);
    assert(result.value == 100);
    printf("✓ test_interpret_one_hundred passed\n");
}

void test_interpret_one_hundred_u8(void)
{
    InterpretResult result = interpret("100U8");
    assert(!result.has_error);
    assert(result.value == 100);
    printf("✓ test_interpret_one_hundred_u8 passed\n");
}

void test_interpret_negative_u8(void)
{
    InterpretResult result = interpret("-100U8");
    assert(result.has_error);
    printf("✓ test_interpret_negative_u8 passed\n");
}

void test_interpret_negative_i8(void)
{
    InterpretResult result = interpret("-100I8");
    assert(!result.has_error);
    assert(result.value == -100);
    printf("✓ test_interpret_negative_i8 passed\n");
}

void test_interpret_out_of_range_u8(void)
{
    InterpretResult result = interpret("256U8");
    assert(result.has_error);
    printf("✓ test_interpret_out_of_range_u8 passed\n");
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
    printf("All tests passed!\n");
    return 0;
}
