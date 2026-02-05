#include <stdio.h>
#include "interpret.h"

int main()
{
    InterpretResult r = interpret("(2 + 3) * 4");
    printf("interpret(\"(2 + 3) * 4\") = %d (has_error: %d)\n", r.value, r.has_error);
    if (r.has_error)
        printf("Error: %s\n", r.error_message);
    return 0;
}
