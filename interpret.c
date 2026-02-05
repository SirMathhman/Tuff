#include "interpret.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

typedef struct
{
    const char *suffix;
    long min_value;
    long max_value;
    const char *error_message;
} TypeInfo;

typedef struct
{
    const char *input;
    int pos;
    InterpretResult last_error;
} Parser;

static const TypeInfo type_info[] = {
    {"U8", 0, 255, "Value out of range for U8 (0-255)"},
    {"U16", 0, 65535, "Value out of range for U16 (0-65535)"},
    {"U32", 0, 4294967295L, "Value out of range for U32 (0-4294967295)"},
    {"U64", 0, 9223372036854775807L, "Value out of range for U64"},
    {"I8", -128, 127, "Value out of range for I8 (-128 to 127)"},
    {"I16", -32768, 32767, "Value out of range for I16 (-32768 to 32767)"},
    {"I32", -2147483648L, 2147483647L, "Value out of range for I32"},
    {"I64", -9223372036854775807L - 1, 9223372036854775807L, "Value out of range for I64"},
    {NULL, 0, 0, NULL}};

static int suffix_length(const char *suffix)
{
    if (!suffix || !suffix[0])
        return 0;
    return (suffix[1] != '\0') ? 3 : 2;
}

static int contains_suffix(const char *suffix, const char *search_suffix)
{
    int len = suffix_length(search_suffix);
    return strncmp(suffix, search_suffix, len) == 0;
}

static InterpretResult validate_type(long value, const char *suffix)
{
    if (!suffix || !suffix[0])
    {
        return (InterpretResult){.value = (int)value, .has_error = false, .error_message = NULL};
    }

    for (int i = 0; type_info[i].suffix != NULL; i++)
    {
        if (contains_suffix(suffix, type_info[i].suffix))
        {
            if (value < type_info[i].min_value || value > type_info[i].max_value)
            {
                return (InterpretResult){
                    .value = 0,
                    .has_error = true,
                    .error_message = type_info[i].error_message};
            }
            break;
        }
    }

    return (InterpretResult){.value = (int)value, .has_error = false, .error_message = NULL};
}

static void skip_whitespace(Parser *p)
{
    while (p->input[p->pos] && isspace(p->input[p->pos]))
    {
        p->pos++;
    }
}

static InterpretResult parse_number(Parser *p)
{
    skip_whitespace(p);

    if (!isdigit(p->input[p->pos]))
    {
        return (InterpretResult){
            .value = 0,
            .has_error = true,
            .error_message = "Expected number"};
    }

    long value = 0;
    while (isdigit(p->input[p->pos]))
    {
        value = value * 10 + (p->input[p->pos] - '0');
        p->pos++;
    }

    // Check for type suffix
    const char *suffix_start = &p->input[p->pos];
    if (isalpha(suffix_start[0]))
    {
        p->pos += suffix_length(suffix_start);
    }

    return validate_type(value, suffix_start);
}

static InterpretResult parse_expression(Parser *p);

static InterpretResult parse_additive(Parser *p)
{
    InterpretResult left = parse_number(p);
    if (left.has_error)
        return left;

    skip_whitespace(p);

    while (p->input[p->pos] == '+' || p->input[p->pos] == '-')
    {
        char op = p->input[p->pos];
        p->pos++;

        InterpretResult right = parse_number(p);
        if (right.has_error)
            return right;

        if (op == '+')
            left.value = left.value + right.value;
        else
            left.value = left.value - right.value;

        skip_whitespace(p);
    }

    return left;
}

static InterpretResult parse_expression(Parser *p)
{
    return parse_additive(p);
}

static int is_expression(const char *str)
{
    int in_number = 0;
    for (int i = 0; str[i]; i++)
    {
        // Skip whitespace
        if (isspace(str[i]))
        {
            continue;
        }

        // Handle minus sign
        if (str[i] == '-')
        {
            // If it's at the start or after whitespace/operator, it's a negative sign
            if (i == 0 || !in_number)
            {
                continue;
            }
            // If we're in a number and see '-', it might be a subtraction operator
            // Check if there's a number before it
            if (in_number)
            {
                return 1;
            }
        }
        else if (str[i] == '+' || str[i] == '*' || str[i] == '/')
        {
            if (in_number)
                return 1;
        }
        else if (isdigit(str[i]))
        {
            in_number = 1;
        }
        else if (isalpha(str[i]))
        {
            // Part of a type suffix
            continue;
        }
    }
    return 0;
}

InterpretResult interpret(const char *str)
{
    if (str == NULL || *str == '\0')
    {
        return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
    }

    // Check if this is an expression (contains operators)
    if (is_expression(str))
    {
        Parser p = {.input = str, .pos = 0};
        return parse_expression(&p);
    }

    // Single value parsing
    bool is_negative = (str[0] == '-');
    const char *num_start = is_negative ? str + 1 : str;

    // Find where the numeric part ends
    const char *suffix_start = num_start;
    while (*suffix_start && isdigit(*suffix_start))
    {
        suffix_start++;
    }

    // Check if suffix is unsigned type
    bool is_unsigned_type = (suffix_start[0] != '\0') &&
                            (contains_suffix(suffix_start, "U8") ||
                             contains_suffix(suffix_start, "U16") ||
                             contains_suffix(suffix_start, "U32") ||
                             contains_suffix(suffix_start, "U64"));

    // Error: negative value with unsigned type suffix
    if (is_negative && is_unsigned_type)
    {
        return (InterpretResult){
            .value = 0,
            .has_error = true,
            .error_message = "Cannot parse negative value as unsigned type"};
    }

    // Parse the numeric part
    long value = strtol(str, NULL, 10);

    // Validate range based on type suffix
    return validate_type(value, suffix_start);
}
