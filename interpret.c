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
    char tracked_suffix[4];
    int has_tracked_suffix;
} Parser;

typedef struct
{
    long value;
    const char *suffix;
    int suffix_len;
} NumberValue;

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
    // U8, I8 are 2 chars, U16, I16, U32, I32, U64, I64 are 3 chars
    // Check if second char is a digit (2-char suffix) or a digit and another char (3-char)
    if (isdigit(suffix[1]))
    {
        // Could be 2 chars (U8, I8) or 3 chars (I16, U16, etc.)
        if (suffix[2] && isdigit(suffix[2]))
        {
            return 3; // I16, U16, I32, U32, I64, U64
        }
        return 2; // I8, U8
    }
    return 0;
}

static int contains_suffix(const char *suffix, const char *search_suffix)
{
    int len = suffix_length(search_suffix);
    return strncmp(suffix, search_suffix, len) == 0;
}

static int get_type_info_index(const char *suffix);

static InterpretResult validate_value_by_index(long value, int type_idx)
{
    if (type_idx < 0)
    {
        return (InterpretResult){.value = (int)value, .has_error = false, .error_message = NULL};
    }

    if (value < type_info[type_idx].min_value || value > type_info[type_idx].max_value)
    {
        return (InterpretResult){
            .value = 0,
            .has_error = true,
            .error_message = type_info[type_idx].error_message};
    }

    return (InterpretResult){.value = (int)value, .has_error = false, .error_message = NULL};
}

static InterpretResult validate_type(long value, const char *suffix)
{
    int type_idx = get_type_info_index(suffix);
    return validate_value_by_index(value, type_idx);
}

static int get_type_info_index(const char *suffix)
{
    if (!suffix || !suffix[0])
        return -1;

    for (int i = 0; type_info[i].suffix != NULL; i++)
    {
        if (contains_suffix(suffix, type_info[i].suffix))
        {
            return i;
        }
    }
    return -1;
}

static void skip_whitespace(Parser *p)
{
    while (p->input[p->pos] && isspace(p->input[p->pos]))
    {
        p->pos++;
    }
}

static void extract_suffix(const char *str, int pos, char *suffix_buf)
{
    suffix_buf[0] = '\0';
    if (isalpha(str[pos]))
    {
        int len = suffix_length(&str[pos]);
        strncpy(suffix_buf, &str[pos], len);
        suffix_buf[len] = '\0';
    }
}

static NumberValue parse_number_raw(Parser *p)
{
    skip_whitespace(p);

    if (!isdigit(p->input[p->pos]))
    {
        return (NumberValue){.value = 0, .suffix = NULL, .suffix_len = 0};
    }

    long value = 0;
    while (isdigit(p->input[p->pos]))
    {
        value = value * 10 + (p->input[p->pos] - '0');
        p->pos++;
    }

    // Check for type suffix
    const char *suffix_start = &p->input[p->pos];
    int suffix_len = 0;
    if (isalpha(suffix_start[0]))
    {
        suffix_len = suffix_length(suffix_start);
        p->pos += suffix_len;
    }

    return (NumberValue){.value = value, .suffix = suffix_start, .suffix_len = suffix_len};
}

static InterpretResult parse_number(Parser *p)
{
    NumberValue num = parse_number_raw(p);

    // Validate the parsed number
    char suffix_buf[4] = {0};
    if (num.suffix_len > 0)
    {
        memcpy(suffix_buf, num.suffix, num.suffix_len);
    }

    return validate_type(num.value, num.suffix_len > 0 ? suffix_buf : NULL);
}

static InterpretResult parse_expression(Parser *p);

static InterpretResult parse_additive(Parser *p)
{
    skip_whitespace(p);

    // Parse first number and get its suffix
    NumberValue left_num = parse_number_raw(p);

    // Validate left operand
    char left_suffix[4] = {0};
    if (left_num.suffix_len > 0)
    {
        strncpy(left_suffix, left_num.suffix, left_num.suffix_len);
        left_suffix[left_num.suffix_len] = '\0';
    }

    InterpretResult left = validate_type(left_num.value, left_num.suffix_len > 0 ? left_suffix : NULL);
    if (left.has_error)
        return left;

    long result_value = left_num.value;
    char tracked_suffix[4] = {0};
    int has_tracked_suffix = 0;

    if (left_num.suffix_len > 0)
    {
        strncpy(tracked_suffix, left_num.suffix, left_num.suffix_len);
        tracked_suffix[left_num.suffix_len] = '\0';
        has_tracked_suffix = 1;
    }

    skip_whitespace(p);

    while (p->input[p->pos] == '+' || p->input[p->pos] == '-')
    {
        char op = p->input[p->pos];
        p->pos++;

        // Parse right number
        NumberValue right_num = parse_number_raw(p);

        // Validate right operand
        char right_suffix[4] = {0};
        if (right_num.suffix_len > 0)
        {
            strncpy(right_suffix, right_num.suffix, right_num.suffix_len);
            right_suffix[right_num.suffix_len] = '\0';
        }

        InterpretResult right = validate_type(right_num.value, right_num.suffix_len > 0 ? right_suffix : NULL);
        if (right.has_error)
            return right;

        // Perform operation
        if (op == '+')
            result_value = result_value + right_num.value;
        else
            result_value = result_value - right_num.value;

        // Determine which type constraint applies:
        // 1. If left operand has a type suffix, use its type (unless right has different type)
        // 2. Otherwise, if right operand has a type suffix, use its type
        char validation_suffix[4] = {0};
        int should_validate = 0;

        if (has_tracked_suffix)
        {
            // Left has a type suffix
            should_validate = 1;

            // But only validate if right operand is untyped or same type as left
            if (right_num.suffix_len > 0 && right_num.suffix_len != left_num.suffix_len)
            {
                should_validate = 0;
            }
            else if (right_num.suffix_len > 0 && left_num.suffix_len > 0)
            {
                // Both have suffixes - check if they're the same
                if (strncmp(left_num.suffix, right_num.suffix, left_num.suffix_len) != 0)
                {
                    should_validate = 0;
                }
            }

            if (should_validate)
            {
                strncpy(validation_suffix, tracked_suffix, sizeof(validation_suffix) - 1);
            }
        }
        else if (right_num.suffix_len > 0)
        {
            // Left is untyped but right has a type suffix - validate against right
            should_validate = 1;
            strncpy(validation_suffix, right_suffix, sizeof(validation_suffix) - 1);
        }

        if (should_validate)
        {
            int type_idx = get_type_info_index(validation_suffix);
            InterpretResult validation_result = validate_value_by_index(result_value, type_idx);
            if (validation_result.has_error)
            {
                return validation_result;
            }
        }

        skip_whitespace(p);
    }

    return (InterpretResult){.value = (int)result_value, .has_error = false, .error_message = NULL};
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
