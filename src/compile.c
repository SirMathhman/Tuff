#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "compile.h"

const char *compile_tuff_to_c(const char *input)
{
    /* TODO: implement actual compilation */
    char *result = malloc(strlen("compiled: ") + strlen(input) + 1);
    if (result == NULL)
        return NULL;
    sprintf(result, "compiled: %s", input);
    return result;
}