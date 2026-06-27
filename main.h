#pragma once

#include <stdbool.h>

typedef struct
{
    char *message;
} CompileError;

CompileError get_compile_error();

bool has_compile_error();

char *compile(char *source);