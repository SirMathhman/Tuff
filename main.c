#define _CRT_SECURE_NO_WARNINGS
#include <string.h>
#include "main.h"

// TODO: the rest

static bool has_compile_error_bool;
static CompileError error;

bool has_compile_error()
{
    return has_compile_error_bool;
}

CompileError get_compile_error()
{
    return error;
}

char *compile(char *source)
{
    has_compile_error_bool = true;
    error.message[0] = '\0';
    strcat(error.message, "Invalid source: '");
    strcat(error.message, source);
    strcat(error.message, "'");

    return source;
}
