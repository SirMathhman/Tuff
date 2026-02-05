#include <assert.h>
#include <stdio.h>
#include "interpret.h"

void test_interpret_empty_string(void)
{
    int result = interpret("");
    assert(result == 0);
    printf("✓ test_interpret_empty_string passed\n");
}

void test_interpret_one_hundred(void)
{
    int result = interpret("100");
    assert(result == 100);
    printf("✓ test_interpret_one_hundred passed\n");
}

int main(void)
{
    printf("Running tests...\n");
    test_interpret_empty_string();
    test_interpret_one_hundred();
    printf("All tests passed!\n");
    return 0;
}
