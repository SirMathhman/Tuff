#include <stdio.h>
#include "interpret.h"

int main(void)
{
    // Test the simple then block value
    InterpretResult r1 = interpret("{ 1 }");
    printf("Test 1 - Block with 1: Result = %d\n", r1.value);

    // Test assignment inside block
    InterpretResult r2 = interpret("let mut x = 0; { x = 1; } x");
    printf("Test 2 - Assignment in block: Result = %d\n", r2.value);

    // Test if-else with simple blocks
    InterpretResult r3 = interpret("let mut x = 0; if (true) { x = 1; } else { x = 2; }");
    printf("Test 3 - If-else with blocks (no final x): Result = %d\n", r3.value);

    // Test if-else with simple blocks plus final x
    InterpretResult r4 = interpret("let mut x = 0; if (true) { x = 1; } else { x = 2; } x");
    printf("Test 4 - If-else with blocks and final x: Result = %d\n", r4.value);

    return 0;
}
