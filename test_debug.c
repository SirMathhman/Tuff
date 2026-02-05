#include <stdio.h>
#include "interpret.h"

int main()
{
    printf("Testing: let mut x = 0; { if (true) x = 1; else x = 2; } x\n");
    InterpretResult result = interpret("let mut x = 0; { if (true) x = 1; else x = 2; } x");
    if (result.has_error)
    {
        printf("ERROR: %s\n", result.error_message);
    }
    else
    {
        printf("SUCCESS: Result = %d\n", result.value);
    }
    return 0;
}
