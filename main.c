#include "main.h"

// TODO: the rest

bool has_compile_error_bool;
CompileError error;

bool has_compile_error()
{
    return has_compile_error_bool;
}

char *compile(char *source)
{
    has_compile_error_bool = true;
    error.message[0] = '\0';
    strcat(error.message, "Invalid source: ");
    strcat(error.message, source);

    return source;
}

int main()
{
    return 0;
}