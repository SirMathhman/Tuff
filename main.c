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
static void append_str(const char *s);
static void append_decl(const char *s);
void parse_top_level(void);
void parse_block_at_top_level(void);

// Buffer for hoisted declarations (let bindings at any nesting level)
static char decl_buffer[2048];

// Pre-declarations buffer: nested block lets go here so they appear BEFORE outer assignments
static char pre_decl[1024];

// Body buffer: holds the return expression and other non-declaration code
static char body[2048];

// Current target buffer — points to either decl_buffer or body depending on context
static char *target = NULL;

// Append a string to current target buffer
static void append_str(const char *s)
{
    strcat(target, s);
}

// Append a single character to current target buffer
static void append_char(char c)
{
    int len = strlen(target);
    target[len] = c;
    target[len + 1] = '\0';
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
        sprintf(target + strlen(target), "(scanf(\"%%d\", &n%d), n%d)", idx, idx);
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

// Parse a block: { stmt* expr } - hoists let-decls to pre_decl, wraps final expr in parens
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

            // Switch target to pre_decl for nested let bindings so they appear BEFORE outer code
            char *saved_target = target;
            int decl_len = strlen(pre_decl);
            if (decl_len > 0)
                strcat(pre_decl, "\n");
            sprintf(pre_decl + strlen(pre_decl), "int %s=", varname);
            target = pre_decl;

            skip_ws();
            if (*input == '=')
                input++;
            skip_ws();

            parse_expr();
            strcat(target, ";");

            // Restore original target
            target = saved_target;

            skip_ws();
            if (*input == ';')
                input++;

            continue;
        }

        break; // final expression
    }

    // Wrap final expr in parens so it works as part of larger expressions
    append_str("(");
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

    // Clear buffers for this compilation and set target to body
    pre_decl[0] = '\0';
    decl_buffer[0] = '\0';
    body[0] = '\0';
    target = body;

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

    // Parse and translate - let-decls go to decl_buffer, expressions to body
    parse_top_level();

    // Merge: header + pre-declarations (nested lets) + declarations (outer lets) + body
    if (strlen(pre_decl) > 0)
        strcat(generated_code, pre_decl);
    if (strlen(decl_buffer) > 0)
        strcat(generated_code, decl_buffer);
    strcat(generated_code, "\n");
    strcat(generated_code, body);
    strcat(generated_code, "}\n");

    return generated_code;
}

// Top-level: handle let-decls (hoisted), then return final expression in body buffer
void parse_top_level(void)
{
    skip_ws();

    // Handle top-level let statements — hoist to decl_buffer
    while (starts_with(input, "let "))
    {
        input += 4;
        skip_ws();

        char varname[64];
        int vi = 0;
        while ((*input >= 'a' && *input <= 'z') || (*input >= 'A' && *input <= 'Z') ||
               (*input >= '0' && *input <= '9') || *input == '_')
            varname[vi++] = (char)*input++;
        varname[vi] = '\0';

        // Switch target to decl_buffer for this let binding, add newline separator if needed
        char *saved_target = target;
        int decl_len = strlen(decl_buffer);
        if (decl_len > 0)
            strcat(decl_buffer, "\n");
        sprintf(decl_buffer + strlen(decl_buffer), "int %s=", varname);
        target = decl_buffer;

        skip_ws();
        if (*input == '=')
            input++;
        skip_ws();

        parse_expr();
        strcat(target, ";");

        // Restore original target
        target = saved_target;

        // Skip optional ';' in source (Tuff syntax)
        skip_ws();
        if (*input == ';')
            input++;
    }

    // If we start with a block at top level, process it specially
    if (*input == '{')
    {
        parse_block_at_top_level();
    }
    else
    {
        append_str("return ");
        parse_expr();
        append_char(';');
    }
}

// Parse block at top level: hoist let-decls to pre_decl (so they appear before outer code)
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

            // Switch target to pre_decl for let bindings, add newline separator if needed
            char *saved_target = target;
            int decl_len = strlen(pre_decl);
            if (decl_len > 0)
                strcat(pre_decl, "\n");
            sprintf(pre_decl + strlen(pre_decl), "int %s=", varname);
            target = pre_decl;

            skip_ws();
            if (*input == '=')
                input++;
            skip_ws();

            parse_expr();
            strcat(target, ";");

            // Restore original target
            target = saved_target;

            skip_ws();
            if (*input == ';')
                input++;

            continue;
        }

        break; // final expression
    }

    append_str("return ");
    parse_expr();
    append_char(';');

    skip_ws();
    if (*input == '}')
        input++;
}
