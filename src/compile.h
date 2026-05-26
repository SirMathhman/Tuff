#ifndef TUFF_COMPILE_H
#define TUFF_COMPILE_H
#include <stdbool.h>

typedef enum
{
    UnsupportedBitWidth,
    NoError
} CompileError;

void clear_compile_error();

bool has_compile_error();

CompileError get_compile_error();

const char *compile_tuff_to_c(const char *input);

#endif