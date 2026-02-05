#include <stdio.h>
#include "interpret.h"

int main(void)
{
    InterpretResult r1 = interpret("true");
    printf("interpret(\"true\") = value:%d, error:%d, msg:%s\n", (int)r1.value, r1.has_error, r1.error_message ? r1.error_message : "none");

    InterpretResult r2 = interpret("1 + 2");
    printf("interpret(\"1 + 2\") = value:%d, error:%d, msg:%s\n", (int)r2.value, r2.has_error, r2.error_message ? r2.error_message : "none");

    InterpretResult r3 = interpret("true + false");
    printf("interpret(\"true + false\") = value:%d, error:%d, msg:%s\n", (int)r3.value, r3.has_error, r3.error_message ? r3.error_message : "none");

    // Test with parentheses
    InterpretResult r4 = interpret("(true)");
    printf("interpret(\"(true)\") = value:%d, error:%d, msg:%s\n", (int)r4.value, r4.has_error, r4.error_message ? r4.error_message : "none");

    return 0;
}
