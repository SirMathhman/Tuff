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
static char translated[4096];

static int starts_with(const char *s, const char *prefix)
{
    while (*prefix && *s == *prefix)
    {
        s++;
        prefix++;
    }
    return *prefix == '\0';
}

// Translate a Tuff expression to C by replacing each read() with (scanf("%d", &ni), ni)
static void translate(const char *src, char *dst)
{
    int i = 0;
    while (*src)
    {
        if (starts_with(src, "read("))
        {
            // Append: (scanf("%d", &n0), n0) — use %% to produce literal % in output
            sprintf(dst + strlen(dst), "(scanf(\"%%d\", &n%d), n%d)", i, i);
            src += 6; // skip past "read()"
            i++;
        }
        else
        {
            *dst = *src;
            dst++;
            src++;
        }
    }
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

    // Translate Tuff expression to C and generate code
    translated[0] = '\0';
    translate(source, translated);
    strcpy(generated_code, "#include <stdio.h>\nint main() { int n0; return (");
    strcat(generated_code, translated);
    strcat(generated_code, "); }\n");
    return generated_code;
}
