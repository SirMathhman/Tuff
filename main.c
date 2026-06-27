#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
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

static char generated_code[4096];

static int is_number(const char *s)
{
    if (s[0] == '\0')
        return 0;
    int i = s[0] == '-' || s[0] == '+' ? 1 : 0;
    while (s[i])
    {
        if (s[i] < '0' || s[i] > '9')
            return 0;
        i++;
    }
    return 1;
}

char *compile(char *source)
{
    has_compile_error_bool = false;

    // Check if source is empty (valid: returns 0)
    if (source[0] == '\0')
    {
        strcpy(generated_code, "#include <stdio.h>\nint main() { return 0; }\n");
        return generated_code;
    }

    // If source is a plain number, generate code that returns it
    if (is_number(source))
    {
        sprintf(generated_code, "#include <stdio.h>\nint main() { return %s; }\n", source);
        return generated_code;
    }

    // TODO: the rest - parse Tuff source and generate C code

    has_compile_error_bool = true;
    error.message[0] = '\0';
    strcat(error.message, "Invalid source: '");
    strcat(error.message, source);
    strcat(error.message, "'");

    return generated_code;
}
