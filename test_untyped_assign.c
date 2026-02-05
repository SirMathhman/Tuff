#include <stdio.h>
#include "interpret.h"

int main(void)
{
    printf("Test 1: let x = 0; let y : I32 = x; y\n");
    InterpretResult r1 = interpret("let x = 0; let y : I32 = x; y");
    printf("  Result: value=%d, has_error=%d\n", r1.value, r1.has_error);
    if (r1.has_error)
        printf("  Error: %s\n", r1.error_message);

    printf("\nTest 2: let x = 0; let y : U8 = x; y\n");
    InterpretResult r2 = interpret("let x = 0; let y : U8 = x; y");
    printf("  Result: value=%d, has_error=%d\n", r2.value, r2.has_error);
    if (r2.has_error)
        printf("  Error: %s\n", r2.error_message);

    printf("\nTest 3: let x = 0; let y : I8 = x; y\n");
    InterpretResult r3 = interpret("let x = 0; let y : I8 = x; y");
    printf("  Result: value=%d, has_error=%d\n", r3.value, r3.has_error);
    if (r3.has_error)
        printf("  Error: %s\n", r3.error_message);

    printf("\nTest 4: let x = 0; let y : U16 = x; y\n");
    InterpretResult r4 = interpret("let x = 0; let y : U16 = x; y");
    printf("  Result: value=%d, has_error=%d\n", r4.value, r4.has_error);
    if (r4.has_error)
        printf("  Error: %s\n", r4.error_message);

    return 0;
}
