#include <stdio.h>
#include "interpret.h"

int main(void)
{
    // Test 1: if-else without block (should work)
    InterpretResult r1 = interpret("let mut x = 0; if (true) x = 1; else x = 2; x");
    printf("Test 1 (no block, true): ");
    if (r1.has_error)
    {
        printf("ERROR: %s\n", r1.error_message);
    }
    else
    {
        printf("Result = %ld\n", r1.value);
    }

    // Test 2: if-else with block (failing)
    InterpretResult r2 = interpret("let mut x = 0; { if (true) x = 1; else x = 2; } x");
    printf("Test 2 (with block, true): ");
    if (r2.has_error)
    {
        printf("ERROR: %s\n", r2.error_message);
    }
    else
    {
        printf("Result = %ld\n", r2.value);
    }

    // Test 3: if-else with block and false condition
    InterpretResult r3 = interpret("let mut x = 0; { if (false) x = 1; else x = 2; } x");
    printf("Test 3 (with block, false): ");
    if (r3.has_error)
    {
        printf("ERROR: %s\n", r3.error_message);
    }
    else
    {
        printf("Result = %ld\n", r3.value);
    }

    return 0;
}
