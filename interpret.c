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

// Helper: Check if there's a typed operand ahead in the remaining input
// Scans ahead looking for "+ number_with_suffix" or "- number_with_suffix" patterns
static int has_typed_operand_ahead(const char *input, int pos)
{
    while (input[pos])
    {
        // Skip whitespace
        while (isspace(input[pos]))
            pos++;

        if (input[pos] == '+' || input[pos] == '-')
        {
            pos++; // skip operator
            // Skip whitespace after operator
            while (isspace(input[pos]))
                pos++;

            // Skip digits
            while (isdigit(input[pos]))
                pos++;

            // Check if there's a type suffix
            if (isalpha(input[pos]))
                return 1; // Found typed operand
        }
        else
        {
            break;
        }
    }
    return 0;
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

// Forward declarations
static InterpretResult parse_multiplicative(Parser *p, NumberValue *out_first_num);
static InterpretResult parse_and_validate_operand(Parser *p, NumberValue *out_num);

// Helper: Check if operator matches a set of operators (e.g., "*/" or "+-")
static int is_binary_operator(char c, const char *operators)
{
    while (*operators)
    {
        if (c == *operators)
            return 1;
        operators++;
    }
    return 0;
}

// Helper: Check if we should continue parsing binary operators
// Skips whitespace and returns whether input has one of the operators
static int should_continue_binary_op(Parser *p, const char *operators)
{
    skip_whitespace(p);
    return is_binary_operator(p->input[p->pos], operators);
}

// Helper: Parse the next operator and its right operand (for multiplicative level)
typedef struct
{
    int has_operator;
    char op;
    NumberValue operand;
    InterpretResult validation;
} OperatorAndOperand;

// Generic helper for parsing operator and operand
// Takes a callback function to parse the operand portion
typedef InterpretResult (*OperandParser)(Parser *p, NumberValue *out_num);

static OperatorAndOperand get_next_operator_and_operand_generic(
    Parser *p, const char *operators, OperandParser parser_fn)
{
    if (!should_continue_binary_op(p, operators))
        return (OperatorAndOperand){.has_operator = 0};

    char op = p->input[p->pos];
    p->pos++;

    NumberValue operand = {0};
    InterpretResult validation = parser_fn(p, &operand);

    return (OperatorAndOperand){
        .has_operator = 1,
        .op = op,
        .operand = operand,
        .validation = validation};
}

// Specialization for single operands (used by multiplicative level)
static OperatorAndOperand get_next_operator_and_operand(Parser *p, const char *operators)
{
    return get_next_operator_and_operand_generic(p, operators, parse_and_validate_operand);
}

// Specialization for multiplicative chains (used by additive level)
static OperatorAndOperand get_next_operator_and_multiplicative(Parser *p, const char *operators)
{
    return get_next_operator_and_operand_generic(p, operators, parse_multiplicative);
}

// Macro: Iterate through binary operations with common pattern
#define BINARY_OP_LOOP_START(operators)                                         \
    for (OperatorAndOperand next = get_next_operator_and_operand(p, operators); \
         next.has_operator;                                                     \
         next = get_next_operator_and_operand(p, operators))                    \
    {                                                                           \
        if (next.validation.has_error)                                          \
            return next.validation;

#define BINARY_OP_LOOP_END }

// Helper: Parse next operand, validate it, and return the validation result
static InterpretResult parse_and_validate_operand(Parser *p, NumberValue *out_num)
{
    NumberValue num = parse_number_raw(p);

    if (out_num)
        *out_num = num;

    char suffix_buf[4] = {0};
    if (num.suffix_len > 0)
    {
        strncpy(suffix_buf, num.suffix, num.suffix_len);
        suffix_buf[num.suffix_len] = '\0';
    }

    return validate_type(num.value, num.suffix_len > 0 ? suffix_buf : NULL);
}

static InterpretResult parse_multiplicative(Parser *p, NumberValue *out_first_num)
{
    skip_whitespace(p);

    // Parse first number and validate it
    InterpretResult left = parse_and_validate_operand(p, out_first_num);
    if (left.has_error)
        return left;

    long result_value = (out_first_num && out_first_num->value) ? out_first_num->value : left.value;

    BINARY_OP_LOOP_START("*/")
    if (next.op == '*')
        result_value = result_value * next.operand.value;
    else if (next.operand.value != 0)
        result_value = result_value / next.operand.value;
    BINARY_OP_LOOP_END

    return (InterpretResult){.value = (int)result_value, .has_error = false, .error_message = NULL};
}

static InterpretResult parse_additive(Parser *p)
{
    skip_whitespace(p);

    // Parse first multiplicative term and capture first number's info
    NumberValue first_num = {0};
    InterpretResult left = parse_multiplicative(p, &first_num);
    if (left.has_error)
        return left;

    long result_value = left.value;
    char tracked_suffix[4] = {0};
    char last_suffix[4] = {0};
    int has_tracked_suffix = 0;
    int in_mixed_types = 0; // Track if we've seen mixed types

    if (first_num.suffix_len > 0)
    {
        strncpy(tracked_suffix, first_num.suffix, first_num.suffix_len);
        tracked_suffix[first_num.suffix_len] = '\0';
        strncpy(last_suffix, first_num.suffix, first_num.suffix_len);
        last_suffix[first_num.suffix_len] = '\0';
        has_tracked_suffix = 1;
    }

    skip_whitespace(p);

    for (OperatorAndOperand next = get_next_operator_and_multiplicative(p, "+-");
         next.has_operator;
         next = get_next_operator_and_multiplicative(p, "+-"))
    {
        if (next.validation.has_error)
            return next.validation;

        char op = next.op;
        NumberValue right_num = next.operand;

        // Track last suffix if this operand has one
        if (right_num.suffix_len > 0)
        {
            strncpy(last_suffix, right_num.suffix, right_num.suffix_len);
            last_suffix[right_num.suffix_len] = '\0';
        }

        // Check for invalid type combinations (only if not in mixed types):
        // - Untyped left with typed right: always error
        if (!in_mixed_types && !has_tracked_suffix && right_num.suffix_len > 0)
        {
            return (InterpretResult){
                .value = 0,
                .has_error = true,
                .error_message = "Untyped operand cannot be combined with typed operand"};
        }

        // Perform operation
        if (op == '+')
            result_value = result_value + next.validation.value;
        else
            result_value = result_value - next.validation.value;

        // Validate result against first operand's type if not in mixed types
        if (!in_mixed_types && has_tracked_suffix)
        {
            if (right_num.suffix_len == 0)
            {
                // Typed + untyped: check if there's a different typed operand ahead
                if (!has_typed_operand_ahead(p->input, p->pos))
                {
                    // No typed operand ahead: validate result fits in type
                    int type_idx = get_type_info_index(tracked_suffix);
                    InterpretResult validation_result = validate_value_by_index(result_value, type_idx);
                    if (validation_result.has_error)
                    {
                        return validation_result;
                    }
                }
                else
                {
                    // Typed operand ahead: enter mixed-type territory
                    in_mixed_types = 1;
                    has_tracked_suffix = 0;
                }
            }
            else if (right_num.suffix_len == first_num.suffix_len &&
                     strncmp(right_num.suffix, first_num.suffix, first_num.suffix_len) == 0)
            {
                // Same type: validate result fits in type
                int type_idx = get_type_info_index(tracked_suffix);
                InterpretResult validation_result = validate_value_by_index(result_value, type_idx);
                if (validation_result.has_error)
                {
                    return validation_result;
                }
            }
            else if (right_num.suffix_len > 0)
            {
                // Different type suffix: enter mixed-type territory
                in_mixed_types = 1;
                has_tracked_suffix = 0;
            }
        }
    }

    // If we're in mixed types, validate final result against last operand's type
    if (in_mixed_types && last_suffix[0] != '\0')
    {
        int type_idx = get_type_info_index(last_suffix);
        InterpretResult validation_result = validate_value_by_index(result_value, type_idx);
        if (validation_result.has_error)
        {
            return validation_result;
        }
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
