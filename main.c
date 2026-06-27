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
static const char *input;       // current position in source
static int parse_var_count = 0; // tracks n index during parsing

// Forward declarations
void skip_ws(void);
int starts_with(const char *s, const char *prefix);
void parse_expr(void);
void parse_atom(void);
void parse_block(void);
static void append_char(char c);
void parse_top_level(void);
void parse_block_at_top_level(void);

// Append a single character to generated_code safely
static void append_char(char c)
{
    int len = strlen(generated_code);
    generated_code[len] = c;
    generated_code[len + 1] = '\0';
}

// Skip whitespace
void skip_ws(void)
{
    while (*input == ' ' || *input == '\t' || *input == '\n')
        input++;
}

int starts_with(const char *s, const char *prefix)
{
    while (*prefix && *s == *prefix)
    {
        s++;
        prefix++;
    }
    return *prefix == '\0';
}

// Parse an atom (number, read(), variable ref, block, or parenthesized expr)
void parse_atom(void)
{
    skip_ws();

    // Number literal
    if (*input >= '0' && *input <= '9')
    {
        while (*input >= '0' && *input <= '9')
            append_char(*input++);
        return;
    }

    // read() call — use the next available n variable
    if (starts_with(input, "read("))
    {
        int idx = parse_var_count++;
        sprintf(generated_code + strlen(generated_code), "(scanf(\"%%d\", &n%d), n%d)", idx, idx);
        input += 6; // skip past "read()"
        return;
    }

    // Block: { stmt* expr }
    if (*input == '{')
    {
        parse_block();
        return;
    }

    // Parenthesized expression
    if (*input == '(')
    {
        strcat(generated_code, "(");
        input++;
        skip_ws();
        parse_expr();
        skip_ws();
        if (*input == ')')
            input++;
        strcat(generated_code, ")");
        return;
    }

    // Variable reference (identifier)
    if ((*input >= 'a' && *input <= 'z') || (*input >= 'A' && *input <= 'Z') || *input == '_')
    {
        while ((*input >= 'a' && *input <= 'z') || (*input >= 'A' && *input <= 'Z') ||
               (*input >= '0' && *input <= '9') || *input == '_')
            append_char(*input++);
        return;
    }

    // Unknown token — error
    has_compile_error_bool = true;
    sprintf(error.message, "Unexpected character: '%c'", *input ? *input : '\0');
}

// Parse a block: { stmt* expr } - generates let-decls + wraps final expr in parens (for use as atom)
void parse_block(void)
{
    input++; // skip '{'

    while (*input && *input != '}')
    {
        skip_ws();

        if (starts_with(input, "let "))
        {
            input += 4;
            skip_ws();

            char varname[64];
            int vi = 0;
            while ((*input >= 'a' && *input <= 'z') || (*input >= 'A' && *input <= 'Z') ||
                   (*input >= '0' && *input <= '9') || *input == '_')
                varname[vi++] = (char)*input++;
            varname[vi] = '\0';

            sprintf(generated_code + strlen(generated_code), "int %s=", varname);

            skip_ws();
            if (*input == '=')
                input++;
            skip_ws();

            parse_expr();
            append_char(';');

            skip_ws();
            if (*input == ';')
                input++;

            continue;
        }

        break; // final expression
    }

    // Wrap final expr in parens so it works as part of larger expressions
    strcat(generated_code, "(");
    parse_expr();
    append_char(')');

    skip_ws();
    if (*input == '}')
        input++;
}

// Parse an expression (handles + and -)
void parse_expr(void)
{
    parse_atom();

    while (1)
    {
        skip_ws();

        char op = *input;
        if (op == '+' || op == '-')
        {
            input++; // consume operator
            append_char(' ');
            append_char(op);
            append_char(' ');
            parse_atom();
        }
        else
        {
            break;
        }
    }
}

char *compile(char *source)
{
    has_compile_error_bool = false;
    error.message[0] = '\0';

    // Check if source is empty (valid: returns 0)
    if (source[0] == '\0')
    {
        strcpy(generated_code, "#include <stdio.h>\nint main() { return 0; }\n");
        parse_var_count = 0;
        return generated_code;
    }

    input = source;
    parse_var_count = 0;

    // Count how many read() calls there are so we can declare all variables
    int total_vars = 0;
    const char *p = source;
    while (*p)
    {
        if (starts_with(p, "read("))
            total_vars++;
        p++;
    }

    // Generate C code header with variable declarations
    strcpy(generated_code, "#include <stdio.h>\nint main() { ");
    for (int j = 0; j < total_vars; j++)
        sprintf(generated_code + strlen(generated_code), "int n%d; ", j);

    // Parse and translate - block statements go before return expr
    parse_top_level();
    return generated_code;
}

// Top-level: handle blocks (let-decls first), then return final expression
void parse_top_level(void)
{
    skip_ws();

    // If we start with a block, process let-statements BEFORE the return
    if (*input == '{')
    {
        parse_block_at_top_level();
    }
    else
    {
        strcat(generated_code, "return ");
        parse_expr();
        append_char(';');
    }

    strcat(generated_code, "\n}\n");
}

// Parse block at top level: let-decls on their own lines, then return final expr
void parse_block_at_top_level(void)
{
    input++; // skip '{'

    while (*input && *input != '}')
    {
        skip_ws();

        if (starts_with(input, "let "))
        {
            input += 4;
            skip_ws();

            char varname[64];
            int vi = 0;
            while ((*input >= 'a' && *input <= 'z') || (*input >= 'A' && *input <= 'Z') ||
                   (*input >= '0' && *input <= '9') || *input == '_')
                varname[vi++] = (char)*input++;
            varname[vi] = '\0';

            sprintf(generated_code + strlen(generated_code), "int %s=", varname);

            skip_ws();
            if (*input == '=')
                input++;
            skip_ws();

            parse_expr();
            append_char(';');

            skip_ws();
            if (*input == ';')
                input++;

            continue;
        }

        break; // final expression
    }

    // Now return the final expression in the block
    strcat(generated_code, "return ");
    parse_expr();
    append_char(';');

    skip_ws();
    if (*input == '}')
        input++;
}
