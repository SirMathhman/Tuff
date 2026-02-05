#include <assert.h>
#include <stdio.h>
#include "interpret.h"

void test_interpret_empty_string(void)
{
    int result = interpret("");
    assert(result == 0);
    printf("✓ test_interpret_empty_string passed\n");
}

int main(void)
{
    printf("Running tests...\n");
    test_interpret_empty_string();
    printf("All tests passed!\n");
    return 0;
}
