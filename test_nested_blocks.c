#include <stdio.h>
#include "interpret.h"

int main(void)
{
    InterpretResult r = interpret("let mut x = 0; { if (true) { x = 1; } else { x = 2; } } x");
    printf("Test: let mut x = 0; { if (true) { x = 1; } else { x = 2; } } x\n");
    if (r.has_error)
    {
        printf("ERROR: %s\n", r.error_message);
    }
    else
    {
        printf("Result = %d (expected 1)\n", r.value);
    }
    return 0;
}
