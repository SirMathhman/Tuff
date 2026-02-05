#include <stdio.h>
#include "interpret.h"

int main(void)
{
    // Test without block - works correctly
    InterpretResult r1 = interpret("let mut x = 0; if (true) { x = 1; } else { x = 2; } x");
    printf("Test 1 (if-else with inner blocks, true): Result = %d\n", r1.value);

    // Test with outer block - currently broken
    InterpretResult r2 = interpret("let mut x = 0; { if (true) { x = 1; } else { x = 2; } } x");
    printf("Test 2 (outer+inner blocks, true): Result = %d\n", r2.value);

    // Test with just statements
    InterpretResult r3 = interpret("let mut x = 0; if (true) x = 1; else x = 2; x");
    printf("Test 3 (just statements, true): Result = %d\n", r3.value);

    return 0;
}
