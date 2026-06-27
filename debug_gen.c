#include <stdio.h>
#include "main.h"

int main(void) {
    printf("Test - read with braces:\n%s\n", compile("read() + { read() }"));
    printf("Test - let binding in block:\n%s\n", compile("{ let x = read(); x }"));
    return 0;
}
