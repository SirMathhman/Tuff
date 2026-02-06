#include "interpret.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdio.h>

#define MAX_ARRAY_ELEMENTS 64

typedef struct
{
    const char *suffix;
    long long min_value;
    long long max_value;
    const char *error_message;
} TypeInfo;

typedef struct
{
    char name[32];
    long value;
    char type[16];      // Store variable's type (e.g., "U8", "U16", "*I32", "[I32;3;3]")
    int is_mutable;     // 1 if mutable, 0 if immutable
    int pointer_target; // -1 if not a pointer, otherwise index of pointed-to variable
    int is_array;       // 1 if array, 0 otherwise
    int array_init_count;
    int array_total_count;
    char array_element_type[16];
    long array_values[MAX_ARRAY_ELEMENTS];
    int is_struct;          // 1 if struct instance, 0 otherwise
    int struct_def_idx;     // Index in parser's structs array
    long struct_values[10]; // Field values for struct instances
    int slice_start;        // Start index of slice (for pointer-to-array types)
    int slice_end;          // End index of slice (for pointer-to-array types)
} Variable;

typedef struct
{
    char name[32];
    char param_names[10][32]; // Parameter names
    char param_types[10][32]; // Parameter types
    int param_count;          // Number of parameters
    char return_type[32];     // Return type
    int body_start_pos;       // Position in input where function body starts
    int body_end_pos;         // Position in input where function body ends
    int is_braced_body;       // 1 if body has braces { }, 0 if implicit body
} FunctionInfo;

typedef struct
{
    char name[32];            // Struct name
    char field_names[10][32]; // Field names
    char field_types[10][32]; // Field types
    int field_count;          // Number of fields
} StructInfo;

typedef struct
{
    const char *input;
    int pos;
    InterpretResult last_error;
    char tracked_suffix[16]; // Increased to accommodate "*mut I32"
    int has_tracked_suffix;
    Variable variables[10];
    int var_count;
    char all_declared_names[10][32]; // Track all variable names ever declared
    int all_declared_count;          // Count of all declared names
    int has_temp_array;
    int temp_array_count;
    char temp_array_element_type[16];
    long temp_array_values[MAX_ARRAY_ELEMENTS];
    char declared_functions[10][32]; // Track all declared function names
    int declared_functions_count;    // Count of declared functions
    FunctionInfo functions[10];      // Array of function information
    int functions_count;             // Count of stored functions
    int has_temp_struct;
    int temp_struct_def_idx;
    long temp_struct_values[10];
    char declared_structs[10][32]; // Track all declared struct names
    int declared_structs_count;    // Count of declared structs
    StructInfo structs[10];        // Array of struct definitions
    int structs_count;             // Count of struct definitions
    int temp_slice_start;          // Start index for temporary slice
    int temp_slice_end;            // End index for temporary slice
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
    {"U32", 0, 4294967295LL, "Value out of range for U32 (0-4294967295)"},
    {"U64", 0, 9223372036854775807LL, "Value out of range for U64"},
    {"I8", -128, 127, "Value out of range for I8 (-128 to 127)"},
    {"I16", -32768, 32767, "Value out of range for I16 (-32768 to 32767)"},
    {"I32", -2147483648LL, 2147483647LL, "Value out of range for I32"},
    {"I64", -9223372036854775807LL - 1, 9223372036854775807LL, "Value out of range for I64"},
    {NULL, 0, 0, NULL}};

// Helper: Check if a type string is a pointer type
static int is_pointer_type(const char *type)
{
    return type && type[0] == '*' && type[1] != '\0';
}

// Helper: Check if a pointer type is mutable (*mut Type)
static int is_mutable_pointer_type(const char *pointer_type)
{
    if (!pointer_type || pointer_type[0] != '*')
        return 0;
    // Check if it starts with "*mut " (skip '*', then check 'mut ')
    return pointer_type[1] == 'm' && pointer_type[2] == 'u' && pointer_type[3] == 't' && pointer_type[4] == ' ';
}

// Helper: Extract the base type from a pointer type (e.g., "*I32" -> "I32")
static void extract_pointer_base_type(const char *pointer_type, char *out_base_type, int max_len)
{
    if (!pointer_type || pointer_type[0] != '*')
    {
        out_base_type[0] = '\0';
        return;
    }
    strncpy_s(out_base_type, max_len, &pointer_type[1], _TRUNCATE);
    out_base_type[max_len - 1] = '\0';
}

static InterpretResult make_error(const char *message);
static InterpretResult parse_identifier_or_error(Parser *p, char *out_name, int max_name_len, const char *error_msg);
static InterpretResult expect_char(Parser *p, char expected, const char *error_msg);
static void skip_whitespace(Parser *p);

// Helper: Check if a type string is an array type
static int is_array_type_string(const char *type)
{
    return type && type[0] == '[';
}

// Helper: Check if a type string is a pointer-to-array type (e.g., "*[I32]" or "*mut [I32]")
static int is_pointer_to_array_type(const char *type)
{
    if (!type || type[0] != '*')
        return 0;

    // Skip the '*' and optional 'mut '
    const char *p = type + 1;
    if (p[0] == 'm' && p[1] == 'u' && p[2] == 't' && p[3] == ' ')
    {
        p += 4; // Skip "mut "
    }

    // Check if what remains is an array type indicator
    return p[0] == '[';
}

// Helper: Extract element type from pointer-to-array type (e.g., "*[I32]" -> "I32")
static void extract_pointer_array_element_type(const char *pointer_array_type, char *out_elem_type, int max_len)
{
    if (!is_pointer_to_array_type(pointer_array_type))
    {
        out_elem_type[0] = '\0';
        return;
    }

    // Skip the '*' and optional 'mut '
    const char *p = pointer_array_type + 1;
    if (p[0] == 'm' && p[1] == 'u' && p[2] == 't' && p[3] == ' ')
    {
        p += 4; // Skip "mut "
    }

    // Now p points to '[ElementType]'
    // Skip '['
    p++;

    // Find the closing ']'
    int len = 0;
    while (*p && *p != ']' && len < max_len - 1)
    {
        out_elem_type[len++] = *p;
        p++;
    }
    out_elem_type[len] = '\0';
}

// Helper: Parse non-negative integer from input
static int parse_non_negative_int(Parser *p, int *out_value)
{
    skip_whitespace(p);
    if (!isdigit(p->input[p->pos]))
        return 0;

    int value = 0;
    while (isdigit(p->input[p->pos]))
    {
        value = value * 10 + (p->input[p->pos] - '0');
        p->pos++;
    }
    *out_value = value;
    return 1;
}

// Helper: Parse array type annotation: [Type; InitCount; TotalCount]
static InterpretResult parse_array_type_annotation(
    Parser *p,
    char *out_type,
    int out_type_size,
    char *out_elem_type,
    int out_elem_type_size,
    int *out_init_count,
    int *out_total_count)
{
    InterpretResult open_bracket = expect_char(p, '[', "Expected '[' to start array type");
    if (open_bracket.has_error)
        return open_bracket;
    skip_whitespace(p);

    InterpretResult elem_type_result = parse_identifier_or_error(p, out_elem_type, out_elem_type_size, "Expected array element type");
    if (elem_type_result.has_error)
        return elem_type_result;

    InterpretResult first_sep = expect_char(p, ';', "Expected ';' after array element type");
    if (first_sep.has_error)
        return first_sep;

    int init_count = 0;
    if (!parse_non_negative_int(p, &init_count))
    {
        return make_error("Expected initialized element count");
    }

    InterpretResult second_sep = expect_char(p, ';', "Expected ';' after initialized element count");
    if (second_sep.has_error)
        return second_sep;

    int total_count = 0;
    if (!parse_non_negative_int(p, &total_count))
    {
        return make_error("Expected total element count");
    }

    InterpretResult close_bracket = expect_char(p, ']', "Expected ']' after array type");
    if (close_bracket.has_error)
        return close_bracket;

    if (total_count < init_count)
    {
        return make_error("Array total count must be >= initialized count");
    }

    if (total_count > MAX_ARRAY_ELEMENTS)
    {
        return make_error("Array total count exceeds maximum supported size");
    }

    snprintf(out_type, out_type_size, "[%s;%d;%d]", out_elem_type, init_count, total_count);
    out_type[out_type_size - 1] = '\0';
    *out_init_count = init_count;
    *out_total_count = total_count;

    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

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

static InterpretResult validate_value_by_index(long long value, int type_idx)
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

static InterpretResult validate_type(long long value, const char *suffix)
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

// Type hierarchy definitions for compatibility checking
typedef struct
{
    char type_char; // 'U' for unsigned, 'I' for signed
    const char *source_type;
    const char *wider_types[3];
} TypeHierarchy;

static const TypeHierarchy type_hierarchies[] = {
    {'U', "U8", {"U16", "U32", "U64"}},
    {'U', "U16", {"U32", "U64", NULL}},
    {'U', "U32", {"U64", NULL, NULL}},
    {'I', "I8", {"I16", "I32", "I64"}},
    {'I', "I16", {"I32", "I64", NULL}},
    {'I', "I32", {"I64", NULL, NULL}},
    {0, NULL, {NULL, NULL, NULL}}};

// Helper: Check if source type can be assigned to destination type
// using the unified type hierarchy
static int check_type_hierarchy(char type_char, const char *dest, const char *src)
{
    for (int i = 0; type_hierarchies[i].type_char != 0; i++)
    {
        if (type_hierarchies[i].type_char == type_char && contains_suffix(src, type_hierarchies[i].source_type))
        {
            for (int j = 0; type_hierarchies[i].wider_types[j] != NULL; j++)
            {
                if (contains_suffix(dest, type_hierarchies[i].wider_types[j]))
                    return 1;
            }
            return 0;
        }
    }
    return 0;
}

static int is_type_compatible(const char *dest_type, const char *source_type);

// Helper: Parse array type string "[Type;Init;Total]"
static int parse_array_type_string(const char *type_str, char *out_elem_type, int elem_type_size, int *out_init, int *out_total)
{
    if (!is_array_type_string(type_str))
        return 0;

    const char *p = type_str + 1;
    int i = 0;
    while (*p && *p != ';' && i < elem_type_size - 1)
    {
        out_elem_type[i++] = *p;
        p++;
    }
    out_elem_type[i] = '\0';

    if (*p != ';')
        return 0;
    p++;

    char *endptr = NULL;
    long init_count = strtol(p, &endptr, 10);
    if (endptr == p || *endptr != ';')
        return 0;
    p = endptr + 1;

    long total_count = strtol(p, &endptr, 10);
    if (endptr == p || *endptr != ']')
        return 0;

    if (init_count < 0 || total_count < 0)
        return 0;

    *out_init = (int)init_count;
    *out_total = (int)total_count;
    return 1;
}

// Helper: Check array type compatibility
static int is_array_type_compatible(const char *dest_type, const char *source_type)
{
    char dest_elem[16] = {0};
    char src_elem[16] = {0};
    int dest_init = 0;
    int dest_total = 0;
    int src_init = 0;
    int src_total = 0;

    if (!parse_array_type_string(dest_type, dest_elem, sizeof(dest_elem), &dest_init, &dest_total))
        return 0;
    if (!parse_array_type_string(source_type, src_elem, sizeof(src_elem), &src_init, &src_total))
        return 0;

    if (dest_total != src_total)
        return 0;

    if (!is_type_compatible(dest_elem, src_elem))
        return 0;

    return src_init >= dest_init;
}

// Helper: Check if a source type can be assigned to a destination type
// Returns 1 if compatible, 0 if not
static int is_type_compatible(const char *dest_type, const char *source_type)
{
    if (!dest_type || !source_type || !dest_type[0] || !source_type[0])
        return 0;

    if (is_array_type_string(dest_type) && is_array_type_string(source_type))
        return is_array_type_compatible(dest_type, source_type);

    // Check for Bool type (special case)
    if (strcmp(dest_type, "Bool") == 0 && strcmp(source_type, "Bool") == 0)
        return 1;

    // Check for Char type (special case)
    if (strcmp(dest_type, "Char") == 0 && strcmp(source_type, "Char") == 0)
        return 1;

    int dest_idx = get_type_info_index(dest_type);
    int src_idx = get_type_info_index(source_type);

    if (dest_idx < 0 || src_idx < 0)
        return 0;

    // Same type is always compatible
    if (dest_idx == src_idx)
        return 1;

    const char *dest = type_info[dest_idx].suffix;
    const char *src = type_info[src_idx].suffix;

    // Both must have same signedness
    if (dest[0] != src[0])
        return 0;

    // Both must be typed (U or I)
    if (dest[0] != 'U' && dest[0] != 'I')
        return 0;

    return check_type_hierarchy(dest[0], dest, src);
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
        strncpy_s(suffix_buf, sizeof(suffix_buf), &str[pos], len);
        suffix_buf[len] = '\0';
    }
}

// Helper: Consume optional semicolon and skip whitespace
static void consume_optional_semicolon(Parser *p)
{
    skip_whitespace(p);
    if (p->input[p->pos] == ';')
    {
        p->pos++;
        skip_whitespace(p);
    }
}

// Helper: Save variable state
static void save_variable_state(Parser *p, Variable saved_vars[10], int *saved_var_count)
{
    *saved_var_count = p->var_count;
    for (int i = 0; i < p->var_count; i++)
    {
        saved_vars[i] = p->variables[i];
    }
}

// Helper: Restore variable state
static void restore_saved_vars(Parser *p, Variable saved_vars[10], int saved_var_count)
{
    p->var_count = saved_var_count;
    for (int i = 0; i < saved_var_count; i++)
    {
        p->variables[i] = saved_vars[i];
    }
}

// Helper: Set tracked suffix on parser
static void set_tracked_suffix(Parser *p, const char *suffix_buf)
{
    strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), suffix_buf, _TRUNCATE);
    p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
    p->has_tracked_suffix = 1;
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
    char suffix_buf[8] = {0};
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
static InterpretResult make_error(const char *message);
static InterpretResult try_parse_assignment_expression(Parser *p);
static int is_keyword_at(Parser *p, const char *keyword);
static int find_variable(Parser *p, const char *name, int name_len);
static int find_function(Parser *p, const char *name, int name_len);
static int find_struct(Parser *p, const char *name, int name_len);
static int find_struct_field_index(Parser *p, int struct_idx, const char *field_name, int field_name_len);
static int set_variable_with_type(Parser *p, const char *name, int name_len, long value, const char *type);
static void save_variable_state(Parser *p, Variable saved_vars[10], int *saved_var_count);
static void restore_saved_vars(Parser *p, Variable saved_vars[10], int saved_var_count);
static InterpretResult parse_assignment_or_if_else(Parser *p);

// Implementation of parse_and_validate_operand
static InterpretResult parse_and_validate_operand(Parser *p, NumberValue *out_num)
{
    NumberValue num = parse_number_raw(p);

    if (out_num)
        *out_num = num;

    char suffix_buf[8] = {0};
    if (num.suffix_len > 0)
    {
        strncpy_s(suffix_buf, sizeof(suffix_buf), num.suffix, num.suffix_len);
        suffix_buf[num.suffix_len] = '\0';
        // Track the explicit type suffix
        set_tracked_suffix(p, suffix_buf);
    }
    else
    {
        // Untyped number - mark as such, no default type here
        p->has_tracked_suffix = 0;
        p->tracked_suffix[0] = '\0';
    }

    return validate_type(num.value, num.suffix_len > 0 ? suffix_buf : NULL);
}

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

// Forward declarations for callbacks
static InterpretResult parse_primary(Parser *p, NumberValue *out_num);
static InterpretResult parse_multiplicative(Parser *p, NumberValue *out_first_num);
static InterpretResult parse_additive(Parser *p);

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
    return get_next_operator_and_operand_generic(p, operators, parse_primary);
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
static InterpretResult parse_and_validate_operand(Parser *p, NumberValue *out_num);

// Forward declarations for variable handling
static int find_variable(Parser *p, const char *name, int name_len);
static intptr_t parse_identifier(Parser *p, char *out_name, int max_name_len);

// Helper: Set Bool type tracking on parser
static void set_bool_tracked_suffix(Parser *p)
{
    p->has_tracked_suffix = 1;
    strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), "Bool", _TRUNCATE);
    p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
}

// Helper: Parse an array literal [a, b, c]
static InterpretResult parse_array_literal(Parser *p)
{
    InterpretResult open_bracket = expect_char(p, '[', "Expected '[' to start array literal");
    if (open_bracket.has_error)
        return open_bracket;

    skip_whitespace(p);

    int count = 0;
    char element_type[16] = {0};
    int has_element_type = 0;

    if (p->input[p->pos] == ']')
    {
        p->pos++;
        p->has_temp_array = 1;
        p->temp_array_count = 0;
        p->temp_array_element_type[0] = '\0';
        p->has_tracked_suffix = 0;
        return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
    }

    while (p->input[p->pos])
    {
        if (count >= MAX_ARRAY_ELEMENTS)
        {
            return make_error("Array literal exceeds maximum supported size");
        }

        InterpretResult elem_result = parse_additive(p);
        if (elem_result.has_error)
            return elem_result;

        if (p->has_tracked_suffix && strcmp(p->tracked_suffix, "Bool") == 0)
        {
            return make_error("Boolean values cannot be used in array literals");
        }

        if (!has_element_type)
        {
            if (p->has_tracked_suffix && p->tracked_suffix[0] != '\0')
            {
                strncpy_s(element_type, sizeof(element_type), p->tracked_suffix, _TRUNCATE);
                element_type[sizeof(element_type) - 1] = '\0';
            }
            else
            {
                strncpy_s(element_type, sizeof(element_type), "I32", _TRUNCATE);
                element_type[sizeof(element_type) - 1] = '\0';
            }
            has_element_type = 1;
        }
        else
        {
            if (p->has_tracked_suffix && p->tracked_suffix[0] != '\0')
            {
                if (!is_type_compatible(element_type, p->tracked_suffix))
                {
                    return make_error("Array literal element types must match");
                }
            }
            else
            {
                InterpretResult validation = validate_type(elem_result.value, element_type);
                if (validation.has_error)
                    return validation;
            }
        }

        InterpretResult elem_validation = validate_type(elem_result.value, element_type);
        if (elem_validation.has_error)
            return elem_validation;

        p->temp_array_values[count++] = elem_result.value;

        skip_whitespace(p);
        if (p->input[p->pos] == ',')
        {
            p->pos++;
            skip_whitespace(p);
            continue;
        }

        if (p->input[p->pos] == ']')
        {
            p->pos++;
            break;
        }

        return make_error("Expected ',' or ']' after array literal element");
    }

    p->has_temp_array = 1;
    p->temp_array_count = count;
    strncpy_s(p->temp_array_element_type, sizeof(p->temp_array_element_type), element_type, _TRUNCATE);
    p->temp_array_element_type[sizeof(p->temp_array_element_type) - 1] = '\0';
    p->has_tracked_suffix = 0;

    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Helper: Parse bracket notation [index] and return the index value
// Returns index_result with value set to the parsed index
// This is used by both array indexing and array element assignment
// Helper: Set tracked suffix for a value and populate output number struct
// Used when returning indexed values or dereferences with explicit types
static void set_tracked_suffix_and_output(Parser *p, const char *type, long value, NumberValue *out_num)
{
    strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), type, _TRUNCATE);
    p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
    p->has_tracked_suffix = 1;

    if (out_num)
    {
        out_num->value = value;
        out_num->suffix = p->tracked_suffix;
        out_num->suffix_len = strlen(p->tracked_suffix);
    }
}

static InterpretResult parse_bracket_index(Parser *p, long *out_index)
{
    InterpretResult open_bracket = expect_char(p, '[', "Expected '[' to start bracket notation");
    if (open_bracket.has_error)
        return open_bracket;

    InterpretResult index_result = parse_additive(p);
    if (index_result.has_error)
        return index_result;

    if (p->has_tracked_suffix && strcmp(p->tracked_suffix, "Bool") == 0)
    {
        return make_error("Array index must be a numeric value");
    }

    InterpretResult close_bracket = expect_char(p, ']', "Expected ']' after index");
    if (close_bracket.has_error)
        return close_bracket;

    *out_index = index_result.value;
    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Helper: Parse array index access (array[idx])
static InterpretResult parse_array_index(Parser *p, int var_idx, NumberValue *out_num)
{
    long index_value = 0;
    InterpretResult bracket_result = parse_bracket_index(p, &index_value);
    if (bracket_result.has_error)
        return bracket_result;

    if (index_value < 0 || index_value >= p->variables[var_idx].array_total_count)
    {
        return make_error("Array index out of bounds");
    }

    if (index_value >= p->variables[var_idx].array_init_count)
    {
        return make_error("Array index out of initialized range");
    }

    long value = p->variables[var_idx].array_values[index_value];

    set_tracked_suffix_and_output(p, p->variables[var_idx].array_element_type, value, out_num);

    return (InterpretResult){.value = value, .has_error = false, .error_message = NULL};
}

// Forward declarations
static InterpretResult expect_range_operator(Parser *p);

// Helper: Parse a simple operand (number or variable reference)
static InterpretResult parse_simple_operand(Parser *p, NumberValue *out_num)
{
    skip_whitespace(p);

    // Check for address-of operator (&variable or &mut variable)
    if (p->input[p->pos] == '&')
    {
        p->pos++; // Skip '&'
        skip_whitespace(p);

        // Check for 'mut' keyword after &
        int is_mut_ref = 0;
        if (is_keyword_at(p, "mut"))
        {
            is_mut_ref = 1;
            p->pos += 3; // Skip 'mut'
            skip_whitespace(p);
        }

        // Parse the variable name after & or &mut
        char var_name[32];
        int name_len = parse_identifier(p, var_name, sizeof(var_name));
        if (name_len <= 0)
        {
            return make_error("Expected variable name after & operator");
        }

        // Find the variable
        int var_idx = find_variable(p, var_name, name_len);
        if (var_idx < 0)
        {
            return make_error("Variable not found");
        }

        // Check if this is an array slice: &array[start..end]
        skip_whitespace(p);
        if (p->variables[var_idx].is_array && p->input[p->pos] == '[')
        {
            // This is array slice syntax: &array[start..end]
            p->pos++; // Skip '['
            skip_whitespace(p);

            // Parse start value
            InterpretResult start_result = parse_additive(p);
            if (start_result.has_error)
                return start_result;
            long start_idx = start_result.value;

            // Expect '..' operator
            InterpretResult range_op = expect_range_operator(p);
            if (range_op.has_error)
                return range_op;

            // Parse end value
            InterpretResult end_result = parse_additive(p);
            if (end_result.has_error)
                return end_result;
            long end_idx = end_result.value;

            skip_whitespace(p);

            // Expect closing bracket
            InterpretResult close_bracket = expect_char(p, ']', "Expected ']' after slice range");
            if (close_bracket.has_error)
                return close_bracket;

            // Validate range
            if (start_idx < 0 || start_idx >= p->variables[var_idx].array_total_count)
            {
                return make_error("Slice start index out of bounds");
            }
            if (end_idx < start_idx || end_idx > p->variables[var_idx].array_total_count)
            {
                return make_error("Slice end index out of bounds or less than start");
            }

            // Create slice type: *[ElementType] or *mut [ElementType]
            char slice_type[32];
            if (is_mut_ref)
            {
                snprintf(slice_type, sizeof(slice_type), "*mut [%s]", p->variables[var_idx].array_element_type);
            }
            else
            {
                snprintf(slice_type, sizeof(slice_type), "*[%s]", p->variables[var_idx].array_element_type);
            }
            slice_type[sizeof(slice_type) - 1] = '\0';

            // Set the tracked suffix to the slice type
            set_tracked_suffix_and_output(p, slice_type, var_idx, out_num);

            // Store slice bounds in temporary fields
            p->temp_slice_start = start_idx;
            p->temp_slice_end = end_idx;

            // Return the array variable index as the slice pointer value
            return (InterpretResult){.value = var_idx, .has_error = false, .error_message = NULL};
        }

        // Regular address-of (not a slice)
        // Get the base type of the variable being pointed to
        const char *var_type = p->variables[var_idx].type[0] != '\0'
                                   ? p->variables[var_idx].type
                                   : "I32"; // Default type for untyped variables

        // Create pointer type: "*BaseType" or "*mut BaseType"
        char pointer_type[16];
        if (is_mut_ref)
        {
            snprintf(pointer_type, sizeof(pointer_type), "*mut %s", var_type);
        }
        else
        {
            snprintf(pointer_type, sizeof(pointer_type), "*%s", var_type);
        }

        // Set the tracked suffix to the pointer type
        set_tracked_suffix_and_output(p, pointer_type, var_idx, out_num);

        // The value represents the pointer target (variable index)
        // We encode it so that assignment to pointer variables can use it

        // Return the variable index as the pointer value
        return (InterpretResult){.value = var_idx, .has_error = false, .error_message = NULL};
    }

    // Check for character literal ('a', 'b', etc.)
    if (p->input[p->pos] == '\'')
    {
        // Parse character literal: 'x'
        p->pos++; // Skip opening single quote

        if (!p->input[p->pos] || p->input[p->pos] == '\'')
        {
            return make_error("Expected character in character literal");
        }

        int char_value = (unsigned char)p->input[p->pos];
        p->pos++; // Move to potential closing quote

        if (p->input[p->pos] != '\'')
        {
            return make_error("Expected closing single quote after character literal");
        }
        p->pos++; // Skip closing single quote

        // Set Char type tracking
        strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), "Char", _TRUNCATE);
        p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
        p->has_tracked_suffix = 1;

        if (out_num)
        {
            out_num->value = char_value;
            out_num->suffix = p->tracked_suffix;
            out_num->suffix_len = 4;
        }

        return (InterpretResult){.value = char_value, .has_error = false, .error_message = NULL};
    }

    // Check for dereference operator (*pointer)
    // This is handled at a different parsing level since * is used for multiplication
    // We'll detect it based on pointer type tracking

    // Check for variable reference or boolean literal
    if (isalpha(p->input[p->pos]))
    {
        int saved_pos = p->pos;
        char var_name[32];
        int name_len = parse_identifier(p, var_name, sizeof(var_name));
        if (name_len > 0)
        {
            // Check for boolean literals
            if (strncmp(var_name, "true", name_len) == 0 && name_len == 4)
            {
                if (out_num)
                {
                    out_num->value = 1;
                    out_num->suffix = "Bool";
                    out_num->suffix_len = 4;
                }
                set_bool_tracked_suffix(p);
                return (InterpretResult){.value = 1, .has_error = false, .error_message = NULL};
            }
            if (strncmp(var_name, "false", name_len) == 0 && name_len == 5)
            {
                if (out_num)
                {
                    out_num->value = 0;
                    out_num->suffix = "Bool";
                    out_num->suffix_len = 4;
                }
                set_bool_tracked_suffix(p);
                return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
            }

            // Check for variable reference
            int idx = find_variable(p, var_name, name_len);
            if (idx >= 0)
            {
                skip_whitespace(p);
                if (p->input[p->pos] == '[')
                {
                    // Check if this is an array or a slice (pointer-to-array)
                    int is_indexable = p->variables[idx].is_array ||
                                       is_pointer_to_array_type(p->variables[idx].type);

                    if (!is_indexable)
                    {
                        return make_error("Cannot index non-array variable");
                    }

                    // If it's a slice, we need to handle it differently
                    if (is_pointer_to_array_type(p->variables[idx].type))
                    {
                        // For slices, extract element type from pointer-to-array type
                        char elem_type[16];
                        extract_pointer_array_element_type(p->variables[idx].type, elem_type, sizeof(elem_type));

                        // Parse the index
                        long index_value = 0;
                        InterpretResult bracket_result = parse_bracket_index(p, &index_value);
                        if (bracket_result.has_error)
                            return bracket_result;

                        // Get the array variable that the slice points to
                        int array_var_idx = p->variables[idx].pointer_target;
                        if (array_var_idx < 0 || array_var_idx >= p->var_count || !p->variables[array_var_idx].is_array)
                        {
                            return make_error("Invalid slice pointer");
                        }

                        // Validate the index against the array bounds
                        if (index_value < 0 || index_value >= p->variables[array_var_idx].array_total_count)
                        {
                            return make_error("Array index out of bounds");
                        }

                        if (index_value >= p->variables[array_var_idx].array_init_count)
                        {
                            return make_error("Array index out of initialized range");
                        }

                        // Get the value from the array
                        long value = p->variables[array_var_idx].array_values[index_value];

                        // Set the tracked suffix to the element type
                        set_tracked_suffix_and_output(p, elem_type, value, out_num);

                        return (InterpretResult){.value = value, .has_error = false, .error_message = NULL};
                    }
                    else
                    {
                        // Regular array indexing
                        return parse_array_index(p, idx, out_num);
                    }
                }

                if (p->variables[idx].is_array)
                {
                    return make_error("Array value must be indexed");
                }

                // Handle slice.length property access
                if (is_pointer_to_array_type(p->variables[idx].type))
                {
                    skip_whitespace(p);
                    if (p->input[p->pos] == '.')
                    {
                        p->pos++; // Skip '.'
                        skip_whitespace(p);

                        char property_name[32];
                        int property_name_len = parse_identifier(p, property_name, sizeof(property_name));
                        if (property_name_len <= 0)
                        {
                            return make_error("Expected property name after '.'");
                        }

                        // Check for .length property
                        if (strncmp(property_name, "length", property_name_len) == 0 && property_name_len == 6)
                        {
                            // Return the slice length (end - start)
                            long slice_length = p->variables[idx].slice_end - p->variables[idx].slice_start;

                            // Set tracked suffix to I32 (length is always a numeric value)
                            strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), "I32", _TRUNCATE);
                            p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
                            p->has_tracked_suffix = 1;

                            if (out_num)
                            {
                                out_num->value = slice_length;
                                out_num->suffix = p->tracked_suffix;
                                out_num->suffix_len = 3;
                            }

                            return (InterpretResult){.value = (int)slice_length, .has_error = false, .error_message = NULL};
                        }
                        else if (strncmp(property_name, "init", property_name_len) == 0 && property_name_len == 4)
                        {
                            // Get the underlying array
                            int array_var_idx = p->variables[idx].pointer_target;
                            if (array_var_idx < 0 || array_var_idx >= p->var_count || !p->variables[array_var_idx].is_array)
                            {
                                return make_error("Invalid slice pointer");
                            }

                            // Calculate initialized count within slice bounds
                            int init_count = 0;
                            if (p->variables[idx].slice_start < p->variables[array_var_idx].array_init_count)
                            {
                                int max_init = p->variables[array_var_idx].array_init_count;
                                int slice_end = p->variables[idx].slice_end;
                                int effective_end = (slice_end < max_init) ? slice_end : max_init;
                                init_count = effective_end - p->variables[idx].slice_start;
                            }

                            // Set tracked suffix to I32 (init count is always a numeric value)
                            set_tracked_suffix_and_output(p, "I32", init_count, out_num);

                            return (InterpretResult){.value = init_count, .has_error = false, .error_message = NULL};
                        }
                        else
                        {
                            return make_error("Unknown slice property (only 'length' and 'init' are supported)");
                        }
                    }
                }

                if (p->variables[idx].is_struct)
                {
                    skip_whitespace(p);
                    if (p->input[p->pos] != '.')
                    {
                        return make_error("Struct value must access field");
                    }

                    p->pos++; // Skip '.'
                    skip_whitespace(p);

                    char field_name[32];
                    int field_name_len = parse_identifier(p, field_name, sizeof(field_name));
                    if (field_name_len <= 0)
                    {
                        return make_error("Expected field name after '.'");
                    }

                    int struct_idx = p->variables[idx].struct_def_idx;
                    if (struct_idx < 0 || struct_idx >= p->structs_count)
                    {
                        return make_error("Invalid struct type");
                    }

                    int field_idx = find_struct_field_index(p, struct_idx, field_name, field_name_len);
                    if (field_idx < 0)
                    {
                        return make_error("Unknown struct field");
                    }

                    long field_value = p->variables[idx].struct_values[field_idx];
                    const char *field_type = p->structs[struct_idx].field_types[field_idx];

                    strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), field_type, _TRUNCATE);
                    p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
                    p->has_tracked_suffix = 1;

                    if (out_num)
                    {
                        out_num->value = field_value;
                        out_num->suffix = p->tracked_suffix;
                        out_num->suffix_len = strlen(p->tracked_suffix);
                    }

                    return (InterpretResult){
                        .value = (int)field_value,
                        .has_error = false,
                        .error_message = NULL};
                }

                if (out_num)
                {
                    out_num->value = p->variables[idx].value;
                }
                // Track the variable's type if it has one
                if (p->variables[idx].type[0] != '\0')
                {
                    strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), p->variables[idx].type, _TRUNCATE);
                    p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
                    p->has_tracked_suffix = 1;
                    // Also set the output number's suffix info
                    if (out_num)
                    {
                        out_num->suffix = p->tracked_suffix;
                        out_num->suffix_len = strlen(p->tracked_suffix);
                    }
                }
                else
                {
                    p->has_tracked_suffix = 0;
                    if (out_num)
                    {
                        out_num->suffix_len = 0;
                        out_num->suffix = NULL;
                    }
                }
                return (InterpretResult){
                    .value = (int)p->variables[idx].value,
                    .has_error = false,
                    .error_message = NULL};
            }

            skip_whitespace(p);
            if (p->input[p->pos] == '{')
            {
                int struct_idx = find_struct(p, var_name, name_len);
                if (struct_idx >= 0)
                {
                    p->pos++; // Skip '{'
                    skip_whitespace(p);

                    long field_values[10] = {0};
                    int field_set[10] = {0};
                    int field_count = p->structs[struct_idx].field_count;

                    if (p->input[p->pos] != '}' || field_count > 0)
                    {
                        while (p->input[p->pos] && p->input[p->pos] != '}')
                        {
                            char field_name[32];
                            int field_name_len = parse_identifier(p, field_name, sizeof(field_name));
                            if (field_name_len <= 0)
                            {
                                return make_error("Expected field name in struct initializer");
                            }

                            int field_idx = find_struct_field_index(p, struct_idx, field_name, field_name_len);
                            if (field_idx < 0)
                            {
                                return make_error("Unknown struct field in initializer");
                            }

                            if (field_set[field_idx])
                            {
                                return make_error("Duplicate field in struct initializer");
                            }

                            skip_whitespace(p);
                            if (p->input[p->pos] != ':')
                            {
                                return make_error("Expected ':' after field name in initializer");
                            }
                            p->pos++; // Skip ':'
                            skip_whitespace(p);

                            InterpretResult value_result = parse_additive(p);
                            if (value_result.has_error)
                                return value_result;

                            const char *field_type = p->structs[struct_idx].field_types[field_idx];
                            if (p->has_tracked_suffix && p->tracked_suffix[0] != '\0')
                            {
                                if (!is_type_compatible(field_type, p->tracked_suffix))
                                {
                                    return make_error("Struct field type mismatch");
                                }
                            }
                            else if (strcmp(field_type, "Bool") == 0)
                            {
                                return make_error("Struct field type mismatch");
                            }
                            else
                            {
                                InterpretResult validation = validate_type(value_result.value, field_type);
                                if (validation.has_error)
                                    return validation;
                            }

                            field_values[field_idx] = value_result.value;
                            field_set[field_idx] = 1;

                            skip_whitespace(p);
                            if (p->input[p->pos] == ',')
                            {
                                p->pos++;
                                skip_whitespace(p);
                                continue;
                            }

                            if (p->input[p->pos] == '}')
                            {
                                break;
                            }

                            return make_error("Expected ',' or '}' after struct field value");
                        }
                    }

                    if (p->input[p->pos] != '}')
                    {
                        return make_error("Expected '}' after struct initializer");
                    }
                    p->pos++; // Skip '}'

                    for (int i = 0; i < field_count; i++)
                    {
                        if (!field_set[i])
                        {
                            return make_error("Missing field initializer");
                        }
                    }

                    p->has_temp_struct = 1;
                    p->temp_struct_def_idx = struct_idx;
                    for (int i = 0; i < field_count; i++)
                    {
                        p->temp_struct_values[i] = field_values[i];
                    }

                    strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), p->structs[struct_idx].name, _TRUNCATE);
                    p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
                    p->has_tracked_suffix = 1;

                    if (out_num)
                    {
                        out_num->value = 0;
                        out_num->suffix = p->tracked_suffix;
                        out_num->suffix_len = strlen(p->tracked_suffix);
                    }

                    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
                }
                p->pos = saved_pos;
            }

            // Check for function call
            skip_whitespace(p);
            if (p->input[p->pos] == '(')
            {
                int func_idx = find_function(p, var_name, name_len);
                if (func_idx >= 0)
                {
                    // This is a function call
                    p->pos++; // Skip '('
                    skip_whitespace(p);

                    // Parse arguments
                    InterpretResult args[10];
                    char arg_types[10][32]; // Store argument types
                    int arg_count = 0;

                    if (p->input[p->pos] != ')')
                    {
                        while (1)
                        {
                            if (arg_count >= 10)
                                return make_error("Too many function arguments");

                            // Parse the argument expression
                            InterpretResult arg_result = parse_additive(p);
                            if (arg_result.has_error)
                                return arg_result;

                            args[arg_count] = arg_result;

                            // Capture argument type information
                            if (p->has_tracked_suffix && p->tracked_suffix[0] != '\0')
                            {
                                strncpy_s(arg_types[arg_count], sizeof(arg_types[arg_count]),
                                          p->tracked_suffix, _TRUNCATE);
                                arg_types[arg_count][sizeof(arg_types[arg_count]) - 1] = '\0';
                            }
                            else
                            {
                                arg_types[arg_count][0] = '\0';
                            }

                            arg_count++;

                            skip_whitespace(p);

                            if (p->input[p->pos] == ')')
                                break;
                            else if (p->input[p->pos] == ',')
                            {
                                p->pos++;
                                skip_whitespace(p);
                                continue;
                            }
                            else
                            {
                                return make_error("Expected ',' or ')' in function call");
                            }
                        }
                    }

                    // Expect closing paren
                    if (p->input[p->pos] != ')')
                        return make_error("Expected ')' after function arguments");
                    p->pos++;

                    // Check argument count matches
                    if (arg_count != p->functions[func_idx].param_count)
                        return make_error("Function argument count mismatch");

                    // Validate argument types match parameter types
                    for (int i = 0; i < arg_count; i++)
                    {
                        const char *param_type = p->functions[func_idx].param_types[i];
                        const char *arg_type = arg_types[i][0] != '\0' ? arg_types[i] : NULL;

                        if (arg_type)
                        {
                            // Argument has explicit type - validate compatibility
                            if (!is_type_compatible(param_type, arg_type))
                            {
                                return make_error("Function argument type mismatch");
                            }
                        }
                        else
                        {
                            // Untyped argument - validate it fits in the parameter type
                            InterpretResult validation = validate_type(args[i].value, param_type);
                            if (validation.has_error)
                                return validation;
                        }
                    }

                    // Save current variable state
                    Variable saved_vars[10];
                    int saved_var_count;
                    save_variable_state(p, saved_vars, &saved_var_count);

                    // Bind parameters to arguments
                    for (int i = 0; i < arg_count; i++)
                    {
                        set_variable_with_type(p, p->functions[func_idx].param_names[i],
                                               strlen(p->functions[func_idx].param_names[i]),
                                               args[i].value,
                                               p->functions[func_idx].param_types[i]);
                    }

                    // Save position and jump to function body
                    int saved_pos = p->pos;
                    if (p->functions[func_idx].is_braced_body)
                    {
                        p->pos = p->functions[func_idx].body_start_pos + 1; // Skip opening brace
                    }
                    else
                    {
                        p->pos = p->functions[func_idx].body_start_pos; // No brace to skip
                    }

                    // Parse and execute function body
                    skip_whitespace(p);
                    InterpretResult body_result = parse_assignment_or_if_else(p);

                    // Restore position and variable state
                    p->pos = saved_pos;
                    restore_saved_vars(p, saved_vars, saved_var_count);

                    // Return the function result
                    return body_result;
                }
                else
                {
                    // Identifier not found as function either, reset and try number
                    p->pos = saved_pos;
                }
            }
            else
            {
                // Identifier found but not a known variable - could be type suffix
                // Reset position and try to parse as a number
                p->pos = saved_pos;
            }
        }
    }

    // Parse a number
    return parse_and_validate_operand(p, out_num);
}

// Helper: Find a variable by name
static int find_variable(Parser *p, const char *name, int name_len)
{
    for (int i = 0; i < p->var_count; i++)
    {
        if (strncmp(p->variables[i].name, name, name_len) == 0 &&
            p->variables[i].name[name_len] == '\0')
        {
            return i;
        }
    }
    return -1;
}

// Helper: Skip from current position (at opening brace) to matching closing brace
// Assumes p->pos is positioned at the opening '{'
static void skip_to_matching_brace(Parser *p)
{
    if (p->input[p->pos] != '{')
        return;

    int brace_depth = 1;
    p->pos++;
    while (p->input[p->pos] && brace_depth > 0)
    {
        if (p->input[p->pos] == '{')
            brace_depth++;
        else if (p->input[p->pos] == '}')
            brace_depth--;
        p->pos++;
    }
}

// Helper: Check if a function has been declared
static int has_function_been_declared(Parser *p, const char *name, int name_len)
{
    for (int i = 0; i < p->declared_functions_count; i++)
    {
        if (strncmp(p->declared_functions[i], name, name_len) == 0 &&
            p->declared_functions[i][name_len] == '\0')
        {
            return 1;
        }
    }
    return 0;
}

// Helper: Find a function by name and return its index, or -1 if not found
static int find_function(Parser *p, const char *name, int name_len)
{
    for (int i = 0; i < p->functions_count; i++)
    {
        if (strncmp(p->functions[i].name, name, name_len) == 0 &&
            p->functions[i].name[name_len] == '\0')
        {
            return i;
        }
    }
    return -1;
}

// Helper: Find a struct by name and return its index, or -1 if not found
static int find_struct(Parser *p, const char *name, int name_len)
{
    for (int i = 0; i < p->structs_count; i++)
    {
        if (strncmp(p->structs[i].name, name, name_len) == 0 &&
            p->structs[i].name[name_len] == '\0')
        {
            return i;
        }
    }
    return -1;
}

// Helper: Find a field index within a struct definition, or -1 if not found
static int find_struct_field_index(Parser *p, int struct_idx, const char *field_name, int field_name_len)
{
    if (struct_idx < 0 || struct_idx >= p->structs_count)
        return -1;

    for (int i = 0; i < p->structs[struct_idx].field_count; i++)
    {
        if (strncmp(p->structs[struct_idx].field_names[i], field_name, field_name_len) == 0 &&
            p->structs[struct_idx].field_names[i][field_name_len] == '\0')
        {
            return i;
        }
    }
    return -1;
}

// Helper: Register a declared function name
static void register_declared_function(Parser *p, const char *name, int name_len)
{
    if (p->declared_functions_count < 10)
    {
        strncpy_s(p->declared_functions[p->declared_functions_count],
                  sizeof(p->declared_functions[p->declared_functions_count]),
                  name, name_len);
        p->declared_functions[p->declared_functions_count][name_len] = '\0';
        p->declared_functions_count++;
    }
}

// Helper: Check if a struct has been declared
static int has_struct_been_declared(Parser *p, const char *name, int name_len)
{
    for (int i = 0; i < p->declared_structs_count; i++)
    {
        if (strncmp(p->declared_structs[i], name, name_len) == 0 &&
            p->declared_structs[i][name_len] == '\0')
        {
            return 1;
        }
    }
    return 0;
}

// Helper: Register a declared struct name
static void register_declared_struct(Parser *p, const char *name, int name_len)
{
    if (p->declared_structs_count < 10)
    {
        strncpy_s(p->declared_structs[p->declared_structs_count],
                  sizeof(p->declared_structs[p->declared_structs_count]),
                  name, name_len);
        p->declared_structs[p->declared_structs_count][name_len] = '\0';
        p->declared_structs_count++;
    }
}

// Helper: Parse a function declaration
// Syntax: fn name() : ReturnType => body
static InterpretResult parse_function_declaration(Parser *p)
{
    // Skip 'fn' keyword
    if (!is_keyword_at(p, "fn"))
        return make_error("Expected 'fn' keyword");

    p->pos += 2; // Skip 'fn'
    skip_whitespace(p);

    // Parse function name
    char func_name[32];
    int name_len = parse_identifier(p, func_name, sizeof(func_name));
    if (name_len <= 0)
        return make_error("Expected function name");

    // Check if function already declared
    if (has_function_been_declared(p, func_name, name_len))
        return make_error("Function already declared");

    skip_whitespace(p);

    // Expect opening parenthesis
    if (p->input[p->pos] != '(')
        return make_error("Expected '(' after function name");
    p->pos++;

    skip_whitespace(p);

    // Parse function parameters (name : Type pairs separated by commas)
    // Track parameter names to detect duplicates
    char param_names[10][32];
    char param_types[10][32];
    int param_count = 0;

    while (p->input[p->pos] != ')')
    {
        skip_whitespace(p);

        // Check if we're at the closing parenthesis (no parameters case)
        if (p->input[p->pos] == ')')
            break;

        // Parse parameter name
        char param_name[32];
        int param_name_len = parse_identifier(p, param_name, sizeof(param_name));
        if (param_name_len <= 0)
            return make_error("Expected parameter name");

        // Check if parameter name is already declared
        for (int i = 0; i < param_count; i++)
        {
            if (strncmp(param_names[i], param_name, param_name_len) == 0 &&
                param_names[i][param_name_len] == '\0')
            {
                return make_error("Duplicate parameter name");
            }
        }

        // Register the parameter name
        if (param_count >= 10)
            return make_error("Too many function parameters");
        strncpy_s(param_names[param_count], sizeof(param_names[param_count]), param_name, param_name_len);
        param_names[param_count][param_name_len] = '\0';

        skip_whitespace(p);

        // Expect colon after parameter name
        if (p->input[p->pos] != ':')
            return make_error("Expected ':' after parameter name");
        p->pos++;

        skip_whitespace(p);

        // Parse parameter type
        char param_type[32];
        int param_type_len = parse_identifier(p, param_type, sizeof(param_type));
        if (param_type_len <= 0)
            return make_error("Expected parameter type");

        // Store parameter type
        strncpy_s(param_types[param_count], sizeof(param_types[param_count]), param_type, param_type_len);
        param_types[param_count][param_type_len] = '\0';
        param_count++;

        // Check for comma (more parameters) or closing parenthesis
        if (p->input[p->pos] == ',')
        {
            p->pos++;
            skip_whitespace(p);
            continue;
        }
        else if (p->input[p->pos] == ')')
        {
            break;
        }
        else
        {
            return make_error("Expected ',' or ')' after parameter");
        }
    }

    // Expect closing parenthesis
    if (p->input[p->pos] != ')')
        return make_error("Expected ')' after function parameters");
    p->pos++;

    skip_whitespace(p);

    // Check for return type (optional - can go directly to =>)
    char return_type[32] = {0};
    if (p->input[p->pos] == ':')
    {
        p->pos++; // Skip colon
        skip_whitespace(p);

        // Parse return type
        int type_len = parse_identifier(p, return_type, sizeof(return_type));
        if (type_len <= 0)
            return make_error("Expected return type");

        return_type[type_len] = '\0';

        skip_whitespace(p);
    }
    else
    {
        // No return type specified, default to Void
        strncpy_s(return_type, sizeof(return_type), "Void", _TRUNCATE);
        return_type[sizeof(return_type) - 1] = '\0';
    }

    // Expect arrow
    if (p->input[p->pos] != '=' || p->input[p->pos + 1] != '>')
        return make_error("Expected '=>' after return type");
    p->pos += 2;

    skip_whitespace(p);

    // Parse function body
    // Support two syntaxes:
    // 1. Braced body: => { expression }
    // 2. Implicit body: => expression;

    int body_start_pos = p->pos;
    int body_end_pos = p->pos;
    int is_braced_body = 0;

    if (p->input[p->pos] == '{')
    {
        // Braced body: { expression }
        is_braced_body = 1;
        p->pos++; // Skip '{'
        skip_whitespace(p);

        // Count braces to find matching close
        int brace_count = 1;
        while (brace_count > 0 && p->input[p->pos])
        {
            if (p->input[p->pos] == '{')
                brace_count++;
            else if (p->input[p->pos] == '}')
                brace_count--;
            p->pos++;
        }
        body_end_pos = p->pos;
    }
    else
    {
        // Implicit body: expression;
        // Parse until we find a semicolon
        while (p->input[p->pos] && p->input[p->pos] != ';')
        {
            p->pos++;
        }

        if (p->input[p->pos] != ';')
        {
            return make_error("Expected ';' after implicit function body");
        }

        body_end_pos = p->pos;
        p->pos++; // Skip the semicolon
    }

    // Store the function info
    if (p->functions_count >= 10)
        return make_error("Too many function declarations");

    strncpy_s(p->functions[p->functions_count].name, sizeof(p->functions[p->functions_count].name), func_name, name_len);
    p->functions[p->functions_count].name[name_len] = '\0';

    for (int i = 0; i < param_count; i++)
    {
        strncpy_s(p->functions[p->functions_count].param_names[i], sizeof(p->functions[p->functions_count].param_names[i]), param_names[i], _TRUNCATE);
        p->functions[p->functions_count].param_names[i][31] = '\0';
        strncpy_s(p->functions[p->functions_count].param_types[i], sizeof(p->functions[p->functions_count].param_types[i]), param_types[i], _TRUNCATE);
        p->functions[p->functions_count].param_types[i][31] = '\0';
    }
    p->functions[p->functions_count].param_count = param_count;

    strncpy_s(p->functions[p->functions_count].return_type, sizeof(p->functions[p->functions_count].return_type), return_type, _TRUNCATE);
    p->functions[p->functions_count].return_type[31] = '\0';

    p->functions[p->functions_count].body_start_pos = body_start_pos;
    p->functions[p->functions_count].body_end_pos = body_end_pos;
    p->functions[p->functions_count].is_braced_body = is_braced_body;

    p->functions_count++;

    // Register the function as declared
    register_declared_function(p, func_name, name_len);

    skip_whitespace(p);

    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}
static int has_variable_been_declared(Parser *p, const char *name, int name_len)
{
    for (int i = 0; i < p->all_declared_count; i++)
    {
        if (strncmp(p->all_declared_names[i], name, name_len) == 0 &&
            p->all_declared_names[i][name_len] == '\0')
        {
            return 1;
        }
    }
    return 0;
}

// Helper: Create an error result
static InterpretResult make_error(const char *message)
{
    return (InterpretResult){
        .value = 0,
        .has_error = true,
        .error_message = message};
}

// Helper: Expect and consume closing parenthesis with context message
static InterpretResult expect_closing_paren(Parser *p, const char *context)
{
    skip_whitespace(p);
    if (p->input[p->pos] != ')')
    {
        char buffer[100];
        snprintf(buffer, sizeof(buffer), "Expected ')' after %s", context);
        return make_error(buffer);
    }
    p->pos++;
    skip_whitespace(p);
    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Helper: Parse identifier and check for error
static InterpretResult parse_identifier_or_error(Parser *p, char *out_name, int max_name_len, const char *error_msg)
{
    int len = parse_identifier(p, out_name, max_name_len);
    if (len <= 0)
        return make_error(error_msg);
    return (InterpretResult){.value = len, .has_error = false, .error_message = NULL};
}

// Helper: Expect a character and skip, return error if not found
static InterpretResult expect_char(Parser *p, char expected, const char *error_msg)
{
    skip_whitespace(p);
    if (p->input[p->pos] != expected)
        return make_error(error_msg);
    p->pos++;
    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}
// Helper: Apply compound operator to current and new values
static InterpretResult apply_compound_operator(char compound_op, long current_value, long new_value, long *out_final_value)
{
    long final_value = new_value;

    if (compound_op == '+')
        final_value = current_value + new_value;
    else if (compound_op == '-')
        final_value = current_value - new_value;
    else if (compound_op == '*')
        final_value = current_value * new_value;
    else if (compound_op == '/')
    {
        if (new_value == 0)
            return make_error("Division by zero");
        final_value = current_value / new_value;
    }

    *out_final_value = final_value;
    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Helper: Parse and calculate assignment value after operator is consumed
// Handles compound operators and semicolon consumption
static InterpretResult parse_assignment_rhs(Parser *p, char compound_op, long current_value)
{
    // Parse the value expression
    InterpretResult val_result = parse_additive(p);
    if (val_result.has_error)
        return val_result;

    // Calculate the final value
    long final_value = val_result.value;
    if (compound_op != '=')
    {
        // Apply the compound operation
        InterpretResult op_result = apply_compound_operator(compound_op, current_value, val_result.value, &final_value);
        if (op_result.has_error)
            return op_result;
    }

    // Consume optional semicolon
    skip_whitespace(p);
    if (p->input[p->pos] == ';')
    {
        p->pos++;
    }

    return (InterpretResult){.value = final_value, .has_error = false, .error_message = NULL};
}

// Helper: Register a variable name in the global declared names list
static void register_declared_name(Parser *p, const char *name, int name_len)
{
    if (p->all_declared_count < 10)
    {
        strncpy_s(p->all_declared_names[p->all_declared_count], sizeof(p->all_declared_names[p->all_declared_count]), name, name_len);
        p->all_declared_names[p->all_declared_count][name_len] = '\0';
        p->all_declared_count++;
    }
}

// Helper: Initialize a variable entry with name, value, and type information
static void init_variable_entry(Parser *p, const char *name, int name_len, long value, int pointer_target, int is_mutable, const char *type)
{
    strncpy_s(p->variables[p->var_count].name, sizeof(p->variables[p->var_count].name), name, name_len);
    p->variables[p->var_count].name[name_len] = '\0';
    p->variables[p->var_count].value = value;
    p->variables[p->var_count].is_mutable = is_mutable;
    p->variables[p->var_count].pointer_target = pointer_target;
    if (type && type[0])
    {
        strncpy_s(p->variables[p->var_count].type, sizeof(p->variables[p->var_count].type), type, _TRUNCATE);
        p->variables[p->var_count].type[sizeof(p->variables[p->var_count].type) - 1] = '\0';
    }
    else
    {
        p->variables[p->var_count].type[0] = '\0';
    }
    p->variables[p->var_count].is_array = 0;
    p->variables[p->var_count].array_init_count = 0;
    p->variables[p->var_count].array_total_count = 0;
    p->variables[p->var_count].array_element_type[0] = '\0';
    for (int i = 0; i < MAX_ARRAY_ELEMENTS; i++)
    {
        p->variables[p->var_count].array_values[i] = 0;
    }
    p->variables[p->var_count].is_struct = 0;
    p->variables[p->var_count].struct_def_idx = -1;
    for (int i = 0; i < 10; i++)
    {
        p->variables[p->var_count].struct_values[i] = 0;
    }
    p->variables[p->var_count].slice_start = 0;
    p->variables[p->var_count].slice_end = 0;
    register_declared_name(p, name, name_len);
}

// Helper: Update the type of an existing variable
static void set_variable_type(Variable *var, const char *type)
{
    if (type && type[0])
    {
        strncpy_s(var->type, sizeof(var->type), type, _TRUNCATE);
        var->type[sizeof(var->type) - 1] = '\0';
    }
    else
    {
        var->type[0] = '\0';
    }
}

// Helper: Clear all array-related fields in a variable
static void clear_array_fields(Variable *var)
{
    var->is_array = 0;
    var->array_init_count = 0;
    var->array_total_count = 0;
    var->array_element_type[0] = '\0';
}

// Helper: Clear all struct-related fields in a variable
static void clear_struct_fields(Variable *var)
{
    var->is_struct = 0;
    var->struct_def_idx = -1;
    for (int i = 0; i < 10; i++)
    {
        var->struct_values[i] = 0;
    }
}

// Helper: Set or add a variable with optional type information
// Helper: Set or add a variable with optional type and mutability information
static int set_variable_with_mutability(Parser *p, const char *name, int name_len, long value, const char *type, int is_mutable)
{
    int idx = find_variable(p, name, name_len);
    if (idx >= 0)
    {
        p->variables[idx].value = value;
        p->variables[idx].is_mutable = is_mutable;
        p->variables[idx].pointer_target = -1; // Reset pointer target on update
        set_variable_type(&p->variables[idx], type);
        clear_array_fields(&p->variables[idx]);
        clear_struct_fields(&p->variables[idx]);
        return idx;
    }

    if (p->var_count >= 10)
        return -1; // Too many variables

    init_variable_entry(p, name, name_len, value, -1, is_mutable, type);

    return p->var_count++;
}

// Helper: Set a pointer variable
static int set_pointer_variable_with_mutability(Parser *p, const char *name, int name_len, int target_idx, const char *pointer_type, int is_mutable)
{
    // target_idx is the index of the variable being pointed to
    int idx = find_variable(p, name, name_len);
    if (idx >= 0)
    {
        p->variables[idx].value = 0; // Pointer values don't store direct values
        p->variables[idx].is_mutable = is_mutable;
        p->variables[idx].pointer_target = target_idx;
        set_variable_type(&p->variables[idx], pointer_type);
        clear_array_fields(&p->variables[idx]);
        clear_struct_fields(&p->variables[idx]);
        // If this is a pointer-to-array (slice), store the bounds
        if (is_pointer_to_array_type(pointer_type))
        {
            p->variables[idx].slice_start = p->temp_slice_start;
            p->variables[idx].slice_end = p->temp_slice_end;
        }
        return idx;
    }

    if (p->var_count >= 10)
        return -1; // Too many variables

    init_variable_entry(p, name, name_len, 0, target_idx, is_mutable, pointer_type);

    // If this is a pointer-to-array (slice), store the bounds
    if (is_pointer_to_array_type(pointer_type))
    {
        p->variables[p->var_count].slice_start = p->temp_slice_start;
        p->variables[p->var_count].slice_end = p->temp_slice_end;
    }

    return p->var_count++;
}

// Helper: Set an array variable with mutability
static int set_array_variable_with_mutability(
    Parser *p,
    const char *name,
    int name_len,
    const char *array_type,
    const char *element_type,
    int init_count,
    int total_count,
    const long *values,
    int is_mutable)
{
    if (p->var_count >= 10)
        return -1; // Too many variables

    init_variable_entry(p, name, name_len, 0, -1, is_mutable, array_type);
    p->variables[p->var_count].is_array = 1;
    p->variables[p->var_count].array_init_count = init_count;
    p->variables[p->var_count].array_total_count = total_count;
    strncpy_s(p->variables[p->var_count].array_element_type,
              sizeof(p->variables[p->var_count].array_element_type),
              element_type,
              _TRUNCATE);
    p->variables[p->var_count].array_element_type[sizeof(p->variables[p->var_count].array_element_type) - 1] = '\0';
    for (int i = 0; i < total_count && i < MAX_ARRAY_ELEMENTS; i++)
    {
        p->variables[p->var_count].array_values[i] = (i < init_count && values) ? values[i] : 0;
    }

    return p->var_count++;
}

// Helper: Set a struct variable with mutability
static int set_struct_variable_with_mutability(
    Parser *p,
    const char *name,
    int name_len,
    int struct_def_idx,
    const long *values,
    const char *struct_type,
    int is_mutable)
{
    if (p->var_count >= 10)
        return -1; // Too many variables

    init_variable_entry(p, name, name_len, 0, -1, is_mutable, struct_type);
    p->variables[p->var_count].is_struct = 1;
    p->variables[p->var_count].struct_def_idx = struct_def_idx;

    int field_count = p->structs[struct_def_idx].field_count;
    for (int i = 0; i < field_count && i < 10; i++)
    {
        p->variables[p->var_count].struct_values[i] = values ? values[i] : 0;
    }

    return p->var_count++;
}

// Helper: Set or add a variable with type information (immutable by default)
static int set_variable_with_type(Parser *p, const char *name, int name_len, long value, const char *type)
{
    return set_variable_with_mutability(p, name, name_len, value, type, 0);
}

// Helper: Set or add a variable without type information (immutable by default)
static int set_variable(Parser *p, const char *name, int name_len, long value)
{
    return set_variable_with_type(p, name, name_len, value, NULL);
}

// Helper: Parse an identifier (variable name)
static intptr_t parse_identifier(Parser *p, char *out_name, int max_name_len)
{
    skip_whitespace(p);

    if (!isalpha(p->input[p->pos]))
        return 0;

    int start = p->pos;
    while (isalnum(p->input[p->pos]) || p->input[p->pos] == '_')
    {
        p->pos++;
    }

    int len = p->pos - start;
    if (len >= max_name_len)
        return -1;

    strncpy_s(out_name, max_name_len, &p->input[start], len);
    out_name[len] = '\0';
    return len;
}

// Helper: Parse variable name and return length (or error)
// Helper: Check if a keyword matches at the current position
static int is_keyword_at(Parser *p, const char *keyword)
{
    int i = 0;
    while (keyword[i])
    {
        if (p->input[p->pos + i] != keyword[i])
            return 0;
        i++;
    }
    return 1;
}

// Helper: Parse the 'mut' keyword if present and return mutability flag
static int parse_mut_keyword(Parser *p)
{
    if (is_keyword_at(p, "mut") &&
        (isspace(p->input[p->pos + 3]) || p->input[p->pos + 3] == '\0'))
    {
        p->pos += 3; // Skip 'mut'
        skip_whitespace(p);
        return 1;
    }
    return 0;
}

static InterpretResult parse_and_validate_var_name(Parser *p, char *out_name, int max_name_len)
{
    InterpretResult name_result = parse_identifier_or_error(p, out_name, max_name_len, "Expected variable name");
    if (name_result.has_error)
        return name_result;
    int name_len = name_result.value;
    skip_whitespace(p);
    return (InterpretResult){.value = name_len, .has_error = false, .error_message = NULL};
}

#define PARSE_VAR_NAME_OR_RETURN(p, name_buf, name_len)                 \
    do                                                                  \
    {                                                                   \
        InterpretResult _name_result =                                  \
            parse_and_validate_var_name(p, name_buf, sizeof(name_buf)); \
        if (_name_result.has_error)                                     \
            return _name_result;                                        \
        name_len = _name_result.value;                                  \
    } while (0)

// Helper: Expect and consume a semicolon, then skip whitespace
static InterpretResult expect_semicolon_and_skip(Parser *p, const char *context)
{
    InterpretResult semi_result = expect_char(p, ';', context);
    if (semi_result.has_error)
        return semi_result;
    skip_whitespace(p);
    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Helper: Finalize a statement by expecting semicolon and returning success
static InterpretResult finalize_statement(Parser *p, const char *context)
{
    skip_whitespace(p);
    InterpretResult semi_result = expect_semicolon_and_skip(p, context);
    if (semi_result.has_error)
        return semi_result;
    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Forward declaration for recursion
static InterpretResult parse_additive(Parser *p);
static InterpretResult parse_logical_and(Parser *p);
static InterpretResult parse_logical_or(Parser *p);
static InterpretResult parse_if_else(Parser *p);
static InterpretResult parse_match(Parser *p);
static InterpretResult parse_if_statement(Parser *p);
static InterpretResult parse_while_statement(Parser *p);
static InterpretResult parse_for_statement(Parser *p);
static InterpretResult parse_assignment_or_if_else(Parser *p);
static InterpretResult parse_assignment_statement_in_block(Parser *p);
static int has_assignment_operator(Parser *p);

// Helper: Parse body to skip past it, restoring variable state
// Returns the position where the body ends
static int parse_and_skip_body_restoring_state(Parser *p, int body_start_pos)
{
    Variable saved_vars[10];
    int saved_var_count;
    save_variable_state(p, saved_vars, &saved_var_count);

    p->pos = body_start_pos;
    InterpretResult body_result = parse_assignment_or_if_else(p);
    if (body_result.has_error)
    {
        // Note: caller must handle error since we can't return it from this helper
        return -1;
    }
    int body_end_pos = p->pos;

    restore_saved_vars(p, saved_vars, saved_var_count);

    return body_end_pos;
}

// Helper: Parse loop keyword header (while/for)
// Helper: Parse range operator (..)
static InterpretResult expect_range_operator(Parser *p)
{
    skip_whitespace(p);
    if (p->input[p->pos] != '.' || p->input[p->pos + 1] != '.')
    {
        return make_error("Expected '..' range operator");
    }
    p->pos += 2; // Skip '..'
    skip_whitespace(p);
    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Helper: Initialize loop execution state
// Returns initialized body tracking variables
typedef struct
{
    int body_start_pos;
    int body_end_pos;
} LoopState;

static LoopState init_loop_state(Parser *p)
{
    int body_start_pos = p->pos;
    int body_end_pos = body_start_pos;
    return (LoopState){.body_start_pos = body_start_pos, .body_end_pos = body_end_pos};
}

// Helper: Parse a let statement in a block
static InterpretResult parse_let_statement_in_block(Parser *p)
{
    p->pos += 3; // Skip 'let'
    skip_whitespace(p);

    // Check for 'mut' keyword
    int is_mutable = parse_mut_keyword(p);

    // Parse variable name
    char var_name[32];
    int name_len = 0;
    PARSE_VAR_NAME_OR_RETURN(p, var_name, name_len);

    // Check if variable already exists in current scope OR was declared before (across all scopes)
    if (find_variable(p, var_name, name_len) >= 0)
    {
        return make_error("Variable already declared");
    }
    if (has_variable_been_declared(p, var_name, name_len))
    {
        return make_error("Variable already declared");
    }

    // Variable to store the declared type (for typed declarations)
    char declared_type[16] = {0};
    int is_array_declared = 0;
    char declared_array_elem_type[16] = {0};
    int declared_array_init_count = 0;
    int declared_array_total_count = 0;
    int declared_struct_idx = -1;

    // Check if this is a typed or typeless declaration
    if (p->input[p->pos] == '=')
    {
        // Typeless declaration: let x = value;
        p->pos++; // Skip '='
        skip_whitespace(p);
    }
    else if (p->input[p->pos] == ':')
    {
        // Typed declaration: let x : Type = value; or let x : *Type = value;
        p->pos++; // Skip ':'
        skip_whitespace(p);

        if (p->input[p->pos] == '[')
        {
            InterpretResult array_type_result = parse_array_type_annotation(
                p,
                declared_type,
                sizeof(declared_type),
                declared_array_elem_type,
                sizeof(declared_array_elem_type),
                &declared_array_init_count,
                &declared_array_total_count);
            if (array_type_result.has_error)
                return array_type_result;
            is_array_declared = 1;
        }
        else
        {
            // Check for pointer type (*) or mutable pointer type (*mut)
            int is_pointer = 0;
            int is_mut_pointer = 0;
            if (p->input[p->pos] == '*')
            {
                is_pointer = 1;
                p->pos++; // Skip '*'
                skip_whitespace(p);

                // Check for 'mut' keyword after *
                if (is_keyword_at(p, "mut"))
                {
                    is_mut_pointer = 1;
                    p->pos += 3; // Skip 'mut'
                    skip_whitespace(p);
                }
            }

            // Parse type (could be identifier or array type like [I32])
            char type_name[64]; // Increased to support "*[I32]" types

            if (is_pointer && p->input[p->pos] == '[')
            {
                // Pointer to array type: *[ElementType] (for slices)
                // Parse simplified array type: [Type] (without size counts)
                p->pos++; // Skip '['
                skip_whitespace(p);

                InterpretResult elem_type_result = parse_identifier_or_error(p, type_name, sizeof(type_name), "Expected array element type");
                if (elem_type_result.has_error)
                    return elem_type_result;

                skip_whitespace(p);

                InterpretResult close_bracket = expect_char(p, ']', "Expected ']' after array element type");
                if (close_bracket.has_error)
                    return close_bracket;

                // Store the declared type as pointer to array
                if (is_mut_pointer)
                {
                    snprintf(declared_type, sizeof(declared_type), "*mut [%s]", type_name);
                }
                else
                {
                    snprintf(declared_type, sizeof(declared_type), "*[%s]", type_name);
                }
                declared_type[sizeof(declared_type) - 1] = '\0';
            }
            else
            {
                // Regular identifier type
                InterpretResult type_result = parse_identifier_or_error(p, type_name, sizeof(type_name), "Expected type name");
                if (type_result.has_error)
                    return type_result;

                // Store the declared type for validation later
                if (is_pointer)
                {
                    if (is_mut_pointer)
                    {
                        snprintf(declared_type, sizeof(declared_type), "*mut %s", type_name);
                    }
                    else
                    {
                        snprintf(declared_type, sizeof(declared_type), "*%s", type_name);
                    }
                }
                else
                {
                    strncpy_s(declared_type, sizeof(declared_type), type_name, _TRUNCATE);
                }
                declared_type[sizeof(declared_type) - 1] = '\0';
            }
        }

        if (!is_array_declared && !is_pointer_type(declared_type))
        {
            declared_struct_idx = find_struct(p, declared_type, (int)strlen(declared_type));
        }

        // Expect '='
        InterpretResult eq_result = expect_char(p, '=', "Expected '=' in variable declaration");
        if (eq_result.has_error)
            return eq_result;
        skip_whitespace(p);
    }
    else
    {
        return make_error("Expected '=' or ':' after variable name");
    }

    // Parse the value expression (can be a simple operand or a complex expression, including if-else)
    InterpretResult val_result = parse_if_else(p);
    if (val_result.has_error)
        return val_result;

    if (p->has_temp_array && !is_array_declared)
    {
        return make_error("Array literal must be assigned to an array variable");
    }

    if (p->has_temp_struct && declared_type[0] != '\0' && declared_struct_idx < 0)
    {
        return make_error("Struct literal must be assigned to a struct variable");
    }

    // Determine the actual type to use for the variable
    char actual_type[16] = {0}; // Expanded to 16 to accommodate pointer types like "*I32"

    if (declared_type[0] != '\0')
    {
        // Explicit type declared: validate that the value fits in that type
        strncpy_s(actual_type, sizeof(actual_type), declared_type, _TRUNCATE);
        actual_type[sizeof(actual_type) - 1] = '\0';

        if (is_array_declared)
        {
            if (!p->has_temp_array)
            {
                return make_error("Array initializer required");
            }

            if (p->temp_array_count != declared_array_init_count)
            {
                return make_error("Array initializer count must match declared initialized count");
            }

            if (p->temp_array_element_type[0] != '\0' &&
                !is_type_compatible(declared_array_elem_type, p->temp_array_element_type))
            {
                return make_error("Array element type mismatch");
            }

            for (int i = 0; i < p->temp_array_count; i++)
            {
                InterpretResult element_validation = validate_type(p->temp_array_values[i], declared_array_elem_type);
                if (element_validation.has_error)
                    return element_validation;
            }

            set_array_variable_with_mutability(
                p,
                var_name,
                name_len,
                actual_type,
                declared_array_elem_type,
                declared_array_init_count,
                declared_array_total_count,
                p->temp_array_values,
                is_mutable);

            p->has_temp_array = 0;
            return finalize_statement(p, "Expected ';' after variable declaration");
        }

        if (declared_struct_idx >= 0)
        {
            if (!p->has_temp_struct)
            {
                return make_error("Struct initializer required");
            }

            if (p->temp_struct_def_idx != declared_struct_idx)
            {
                return make_error("Struct type mismatch");
            }

            set_struct_variable_with_mutability(
                p,
                var_name,
                name_len,
                declared_struct_idx,
                p->temp_struct_values,
                declared_type,
                is_mutable);

            p->has_temp_struct = 0;
            return finalize_statement(p, "Expected ';' after variable declaration");
        }

        // Check if declared type is a pointer type
        if (is_pointer_type(declared_type))
        {
            // Pointer type validation
            // Check that the value has a pointer type matching the declared pointer type
            if (!p->has_tracked_suffix || !is_pointer_type(p->tracked_suffix))
            {
                return make_error("Cannot assign non-pointer value to pointer variable");
            }

            // Check that the base types match
            if (strcmp(declared_type, p->tracked_suffix) != 0)
            {
                return make_error("Pointer type mismatch: incompatible base types");
            }

            // For pointer variables, val_result.value contains the target variable index
            // Extract it and store the pointer
            if (val_result.value < 0 || val_result.value >= p->var_count)
            {
                return make_error("Invalid pointer target");
            }

            set_pointer_variable_with_mutability(p, var_name, name_len, val_result.value, actual_type, is_mutable);
        }
        else
        {
            // Non-pointer type validation
            // Check compatibility based on what type the value has
            if (p->has_tracked_suffix && p->tracked_suffix[0] != '\0')
            {
                // Value has explicit type - check compatibility
                if (!is_type_compatible(declared_type, p->tracked_suffix))
                {
                    return make_error("Variable type mismatch: declared type does not match assigned value type");
                }
            }
            else if (strcmp(declared_type, "Bool") == 0)
            {
                // Bool requires boolean values, not numeric ones
                return make_error("Variable type mismatch: declared type does not match assigned value type");
            }
            else
            {
                // Value is untyped - validate it fits in the declared type
                InterpretResult validation = validate_type(val_result.value, declared_type);
                if (validation.has_error)
                    return validation;
            }

            // Validate the value fits in the actual type
            InterpretResult type_validation = validate_type(val_result.value, actual_type);
            if (type_validation.has_error)
                return type_validation;

            // Store variable with the actual type
            set_variable_with_mutability(p, var_name, name_len, val_result.value, actual_type, is_mutable);
        }
    }
    else if (p->has_tracked_suffix && p->tracked_suffix[0] != '\0')
    {
        // No explicit type declared, but value has a type - use value's type
        strncpy_s(actual_type, sizeof(actual_type), p->tracked_suffix, _TRUNCATE);
        actual_type[sizeof(actual_type) - 1] = '\0';

        if (p->has_temp_struct)
        {
            set_struct_variable_with_mutability(
                p,
                var_name,
                name_len,
                p->temp_struct_def_idx,
                p->temp_struct_values,
                actual_type,
                is_mutable);
            p->has_temp_struct = 0;
            return finalize_statement(p, "Expected ';' after variable declaration");
        }

        // If value is a pointer type, handle as pointer variable
        if (is_pointer_type(actual_type))
        {
            set_pointer_variable_with_mutability(p, var_name, name_len, val_result.value, actual_type, is_mutable);
        }
        else
        {
            // Store variable with the tracked type
            set_variable_with_mutability(p, var_name, name_len, val_result.value, actual_type, is_mutable);
        }
    }
    else
    {
        // No explicit type declared, untyped value - default to I32
        strncpy_s(actual_type, sizeof(actual_type), "I32", _TRUNCATE);
        actual_type[sizeof(actual_type) - 1] = '\0';

        if (p->has_temp_struct)
        {
            int struct_idx = p->temp_struct_def_idx;
            strncpy_s(actual_type, sizeof(actual_type), p->structs[struct_idx].name, _TRUNCATE);
            actual_type[sizeof(actual_type) - 1] = '\0';

            set_struct_variable_with_mutability(
                p,
                var_name,
                name_len,
                struct_idx,
                p->temp_struct_values,
                actual_type,
                is_mutable);
            p->has_temp_struct = 0;
            return finalize_statement(p, "Expected ';' after variable declaration");
        }

        // Store variable with I32 type
        set_variable_with_mutability(p, var_name, name_len, val_result.value, actual_type, is_mutable);
    }

    return finalize_statement(p, "Expected ';' after variable declaration");
}

// Helper: Parse a sequence of let statements
static InterpretResult parse_let_statements_loop(Parser *p)
{
    skip_whitespace(p);

    // Track the last statement value to return it if it's a block
    int last_statement_value = 0;
    int has_last_statement = 0;
    int saw_statement = 0;

    // Parse let statements and assignments until none are found
    while (1)
    {
        skip_whitespace(p);

        // Check for function declaration
        if (is_keyword_at(p, "fn"))
        {
            // Look ahead to check if this function has already been parsed by prescan
            int saved_pos = p->pos;
            p->pos += 2; // Skip 'fn'
            skip_whitespace(p);
            char func_name[32];
            int name_len = parse_identifier(p, func_name, sizeof(func_name));

            // Check if function has already been registered (by prescan)
            if (name_len > 0 && find_function(p, func_name, name_len) >= 0)
            {
                // Function already parsed by prescan, skip re-parsing by consuming the declaration
                p->pos = saved_pos;
                // Skip function declaration: "fn name() ... => ... { ... }" or "fn name() ... => ... ;"
                // Find the '=>' first
                while (p->input[p->pos] && (p->input[p->pos] != '=' || p->input[p->pos + 1] != '>'))
                {
                    p->pos++;
                }
                if (p->input[p->pos] == '=')
                {
                    p->pos += 2; // Skip '=>'
                }
                skip_whitespace(p);
                // Now skip the body
                if (p->input[p->pos] == '{')
                {
                    // Braced body: skip until matching '}'
                    skip_to_matching_brace(p);
                }
                else
                {
                    // Implicit body: skip until ';'
                    while (p->input[p->pos] && p->input[p->pos] != ';')
                    {
                        p->pos++;
                    }
                    if (p->input[p->pos] == ';')
                        p->pos++;
                }
                skip_whitespace(p);
                continue;
            }

            // Function not yet parsed, parse it normally
            p->pos = saved_pos;
            InterpretResult fn_result = parse_function_declaration(p);
            if (fn_result.has_error)
                return fn_result;
            skip_whitespace(p);
            has_last_statement = 0; // function declarations don't have values
            saw_statement = 1;
            continue;
        }

        // Check for let statement
        if (is_keyword_at(p, "let"))
        {
            InterpretResult let_result = parse_let_statement_in_block(p);
            if (let_result.has_error)
                return let_result;
            skip_whitespace(p);
            has_last_statement = 0; // let statements don't have values
            saw_statement = 1;
        }
        // Check for dereference assignment statement (*variable = value)
        else if (p->input[p->pos] == '*' && isalpha(p->input[p->pos + 1]))
        {
            // Look ahead to see if this is a dereference assignment
            int saved_pos = p->pos;
            p->pos++; // Skip '*'
            skip_whitespace(p);
            char temp_name[32];
            int name_len = parse_identifier(p, temp_name, sizeof(temp_name));

            // Check if this pointer variable is followed by an assignment operator
            int is_assignment = has_assignment_operator(p);

            // Reset position and handle accordingly
            p->pos = saved_pos;

            if (is_assignment)
            {
                InterpretResult assign_result = try_parse_assignment_expression(p);
                if (assign_result.has_error && strcmp(assign_result.error_message, "not_an_assignment") != 0)
                {
                    return assign_result;
                }
                skip_whitespace(p);
                has_last_statement = 0; // assignments at this level don't have values to return
                saw_statement = 1;
            }
            else
            {
                // Not an assignment, exit the loop
                break;
            }
        }
        // Check for assignment statement (identifier followed by '=')
        else if (isalpha(p->input[p->pos]) && !is_keyword_at(p, "if") && !is_keyword_at(p, "else") && !is_keyword_at(p, "while") && !is_keyword_at(p, "let") && !is_keyword_at(p, "match") && !is_keyword_at(p, "for") && !is_keyword_at(p, "fn") && !is_keyword_at(p, "struct"))
        {
            // Look ahead to see if this is an assignment
            int saved_pos = p->pos;
            char temp_name[32];
            int name_len = parse_identifier(p, temp_name, sizeof(temp_name));

            // Check if this identifier is followed by an assignment operator
            int is_assignment = has_assignment_operator(p);

            // Reset position and handle accordingly
            p->pos = saved_pos;

            if (is_assignment)
            {
                InterpretResult assign_result = parse_assignment_statement_in_block(p);
                if (assign_result.has_error)
                    return assign_result;
                skip_whitespace(p);
                has_last_statement = 0; // assignments at this level don't have values to return
                saw_statement = 1;
            }
            else
            {
                // Not an assignment and not a keyword, exit the loop
                break;
            }
        }
        // Check for block statement {}
        else if (p->input[p->pos] == '{')
        {
            // Parse block as a statement
            int saved_pos = p->pos;
            int saved_var_count_block = p->var_count;
            p->pos++; // Skip '{'

            // Check for let statements in the block
            InterpretResult let_statements_result = parse_let_statements_loop(p);
            if (let_statements_result.has_error)
            {
                p->var_count = saved_var_count_block;
                return let_statements_result;
            }

            skip_whitespace(p);

            // Check for closing brace
            InterpretResult block_expr_result = (InterpretResult){.value = 0, .has_error = false};
            if (p->input[p->pos] != '}')
            {
                // Parse the expression in the block
                block_expr_result = parse_assignment_or_if_else(p);
                if (block_expr_result.has_error)
                {
                    p->var_count = saved_var_count_block;
                    return block_expr_result;
                }

                skip_whitespace(p);
            }

            // Expect closing brace
            if (p->input[p->pos] != '}')
            {
                p->var_count = saved_var_count_block;
                return make_error("Expected closing brace");
            }
            p->pos++; // Skip '}'

            // Preserve mutations to outer-scope variables before restoring scope
            for (int i = 0; i < saved_var_count_block; i++)
            {
                // Values are already updated in place
            }

            // Restore variable scope (remove variables declared inside the block)
            p->var_count = saved_var_count_block;

            skip_whitespace(p);

            // Save the block's value to return it if this is the final statement
            last_statement_value = block_expr_result.value;
            has_last_statement = 1;
            saw_statement = 1;
        }
        else if (p->input[p->pos] == '{')
        {
            // Look ahead to see if this is an empty block
            int saved_pos = p->pos;
            p->pos++; // Skip '{'
            skip_whitespace(p);

            if (p->input[p->pos] == '}')
            {
                // Empty block, skip it and continue looking for the final expression
                p->pos++; // Skip '}'
                skip_whitespace(p);
                // Continue the loop to check for more statements
            }
            else
            {
                // Not an empty block, reset position and break
                p->pos = saved_pos;
                break;
            }
        }
        // Check for if statement (after we've determined it's not a let/assignment/block)
        else if (is_keyword_at(p, "if"))
        {
            // This handles if-statements at statement level within sequences
            // (e.g., after let statements or other statements)
            if (!saw_statement)
            {
                // At the start of a sequence, treat `if` as an expression-level construct
                break;
            }

            InterpretResult if_result = parse_if_statement(p);
            if (if_result.has_error)
                return if_result;

            consume_optional_semicolon(p);

            has_last_statement = 0; // if statements as statements don't produce values
            saw_statement = 1;
        }
        // Check for while statement
        else if (is_keyword_at(p, "while"))
        {
            InterpretResult while_result = parse_while_statement(p);
            if (while_result.has_error)
                return while_result;

            consume_optional_semicolon(p);

            has_last_statement = 0; // while statements don't produce values
            saw_statement = 1;
        }
        // Check for for statement
        else if (is_keyword_at(p, "for"))
        {
            InterpretResult for_result = parse_for_statement(p);
            if (for_result.has_error)
                return for_result;

            consume_optional_semicolon(p);

            has_last_statement = 0; // for statements don't produce values
            saw_statement = 1;
        }
        // Check for struct declaration
        else if (is_keyword_at(p, "struct"))
        {
            p->pos += 6; // Skip 'struct'
            skip_whitespace(p);

            // Parse struct name
            char struct_name[32];
            int name_len = parse_identifier(p, struct_name, sizeof(struct_name));
            if (name_len <= 0)
            {
                return make_error("Expected struct name");
            }

            // Check if struct already declared
            if (has_struct_been_declared(p, struct_name, name_len))
            {
                return make_error("Struct already declared");
            }

            // Register the struct
            register_declared_struct(p, struct_name, name_len);

            skip_whitespace(p);

            // Expect opening brace
            if (p->input[p->pos] != '{')
            {
                return make_error("Expected '{' after struct name");
            }

            p->pos++; // Skip '{'
            skip_whitespace(p);

            // Parse struct fields
            char field_names[10][32];
            char field_types[10][32];
            int field_count = 0;

            while (p->input[p->pos] && p->input[p->pos] != '}')
            {
                skip_whitespace(p);

                // Check if we're at the closing brace
                if (p->input[p->pos] == '}')
                    break;

                // Parse field name
                char field_name[32];
                int field_name_len = parse_identifier(p, field_name, sizeof(field_name));
                if (field_name_len <= 0)
                {
                    return make_error("Expected field name in struct");
                }

                // Check for duplicate field name
                for (int i = 0; i < field_count; i++)
                {
                    if (strncmp(field_names[i], field_name, field_name_len) == 0 &&
                        field_names[i][field_name_len] == '\0')
                    {
                        return make_error("Duplicate field name in struct");
                    }
                }

                // Register the field name
                if (field_count >= 10)
                {
                    return make_error("Too many struct fields");
                }
                strncpy_s(field_names[field_count], sizeof(field_names[field_count]), field_name, field_name_len);
                field_names[field_count][field_name_len] = '\0';
                field_count++;

                skip_whitespace(p);

                // Expect colon
                if (p->input[p->pos] != ':')
                {
                    return make_error("Expected ':' after field name");
                }
                p->pos++; // Skip ':'
                skip_whitespace(p);

                // Parse field type
                char field_type[32];
                int field_type_len = parse_identifier(p, field_type, sizeof(field_type));
                if (field_type_len <= 0)
                {
                    return make_error("Expected field type");
                }

                // Store field type
                strncpy_s(field_types[field_count - 1], sizeof(field_types[field_count - 1]), field_type, field_type_len);
                field_types[field_count - 1][field_type_len] = '\0';

                skip_whitespace(p);

                // Expect semicolon
                if (p->input[p->pos] != ';')
                {
                    return make_error("Expected ';' after field declaration");
                }
                p->pos++; // Skip ';'
            }

            // Expect closing brace
            if (p->input[p->pos] != '}')
            {
                return make_error("Expected '}' after struct fields");
            }
            p->pos++; // Skip '}'

            // Store struct definition
            if (p->structs_count >= 10)
            {
                return make_error("Too many struct definitions");
            }

            strncpy_s(p->structs[p->structs_count].name, sizeof(p->structs[p->structs_count].name), struct_name, name_len);
            p->structs[p->structs_count].name[name_len] = '\0';
            p->structs[p->structs_count].field_count = field_count;

            for (int i = 0; i < field_count; i++)
            {
                strncpy_s(p->structs[p->structs_count].field_names[i], sizeof(p->structs[p->structs_count].field_names[i]), field_names[i], _TRUNCATE);
                p->structs[p->structs_count].field_names[i][31] = '\0';
                strncpy_s(p->structs[p->structs_count].field_types[i], sizeof(p->structs[p->structs_count].field_types[i]), field_types[i], _TRUNCATE);
                p->structs[p->structs_count].field_types[i][31] = '\0';
            }

            p->structs_count++;

            skip_whitespace(p);
            has_last_statement = 0; // struct declarations don't have values
            saw_statement = 1;
            continue;
        }
        else
        {
            // Not a let, assignment, block, if statement, while statement, for statement, or struct declaration, exit the loop
            break;
        }
    }

    // Return the last statement's value if it was a block, otherwise 0
    return (InterpretResult){.value = has_last_statement ? last_statement_value : 0, .has_error = false, .error_message = NULL};
}

// Helper: Check if character at position is an operator followed by '='
// Returns the operator char if found ('+', '-', '*', '/'), '\0' otherwise
static char get_compound_operator_at(const char *input, int pos, char op_char)
{
    if (input[pos] == op_char && input[pos + 1] == '=')
        return op_char;
    return '\0';
}

// Helper: Determine the operator at a position without consuming it
// Returns '+', '-', '*', '/', or '=' if found, '\0' otherwise
static char get_operator_at(const char *input, int pos)
{
    const char compound_ops[] = "+-*/";
    for (int i = 0; compound_ops[i]; i++)
    {
        char op = get_compound_operator_at(input, pos, compound_ops[i]);
        if (op)
            return op;
    }
    if (input[pos] == '=' && input[pos + 1] != '=')
        return '=';
    return '\0';
}

// Helper: Parse a compound assignment operator (+=, -=, *=, /=) or simple assignment (=)
// Returns the operator character, or '\0' if no assignment operator found
static char parse_assignment_operator(Parser *p)
{
    skip_whitespace(p);

    char op = get_operator_at(p->input, p->pos);
    if (op == '=')
    {
        p->pos++; // Skip '='
        return '=';
    }
    else if (op != '\0')
    {
        p->pos += 2; // Skip Op=
        return op;
    }
    return '\0'; // No assignment operator found
}

// Helper: Check if there's an assignment operator at the current position
// Checks for =, +=, -=, *=, /= (skipping whitespace first)
// Does not consume the operator
static int has_assignment_operator(Parser *p)
{
    int temp_pos = p->pos;
    while (isspace(p->input[temp_pos]))
        temp_pos++;

    return get_operator_at(p->input, temp_pos) != '\0';
}

// Helper: Check if there's an assignment operator at the current position
// Returns the operator char if found ('+', '-', '*', '/', '\0' for simple =), '\0' otherwise
static char check_assignment_operator(Parser *p)
{
    skip_whitespace(p);
    if (p->input[p->pos] == '=' && p->input[p->pos + 1] != '=')
        return '=';
    if ((p->input[p->pos] == '+' || p->input[p->pos] == '-' ||
         p->input[p->pos] == '*' || p->input[p->pos] == '/') &&
        p->input[p->pos + 1] == '=')
        return p->input[p->pos];
    return '\0';
}

// Helper: Parse and apply an assignment, returning the assigned value
// Assumes variable name is already parsed and position is at variable name
static InterpretResult parse_and_apply_assignment(Parser *p, const char *var_name, int name_len)
{
    // Find the variable
    int idx = find_variable(p, var_name, name_len);
    if (idx < 0)
    {
        return make_error("Variable not found");
    }

    // Check if variable is mutable
    if (!p->variables[idx].is_mutable)
    {
        return make_error("Cannot assign to immutable variable");
    }

    if (p->variables[idx].is_struct)
    {
        return make_error("Cannot assign to struct variable");
    }

    // Parse assignment operator (handles =, +=, -=, *=, /=)
    char compound_op = parse_assignment_operator(p);
    if (compound_op == '\0')
    {
        return make_error("Expected '=' or compound assignment operator");
    }

    // Check if trying to use compound operator on boolean variable
    if (compound_op != '=' && p->variables[idx].type[0] != '\0' &&
        strcmp(p->variables[idx].type, "Bool") == 0)
    {
        return make_error("Boolean values cannot be used in arithmetic operations");
    }

    skip_whitespace(p);

    // Parse the value expression
    InterpretResult val_result = parse_additive(p);
    if (val_result.has_error)
        return val_result;

    // Calculate the final value
    long final_value = val_result.value;
    if (compound_op != '=')
    {
        // Apply the compound operation using helper function
        long current_value = p->variables[idx].value;
        InterpretResult op_result = apply_compound_operator(compound_op, current_value, val_result.value, &final_value);
        if (op_result.has_error)
            return op_result;
    }

    // If variable has a declared type, check type compatibility
    if (p->variables[idx].type[0] != '\0')
    {
        // For compound operators, validate the result fits in the type
        if (compound_op != '=')
        {
            // Validate that the final value fits in the variable's type
            InterpretResult validation = validate_type(final_value, p->variables[idx].type);
            if (validation.has_error)
                return validation;
        }
        else
        {
            // For simple assignment, check type compatibility of RHS
            // If the assigned value has a type suffix
            if (p->has_tracked_suffix && p->tracked_suffix[0] != '\0')
            {
                // Check if the value's type is compatible with the variable's type
                if (!is_type_compatible(p->variables[idx].type, p->tracked_suffix))
                {
                    return make_error("Assignment type mismatch: assigned value type does not match variable type");
                }
            }
            else
            {
                // Untyped value - validate it fits in the variable's type
                InterpretResult validation = validate_type(val_result.value, p->variables[idx].type);
                if (validation.has_error)
                    return validation;
            }
        }
    }

    // Update the variable's value
    p->variables[idx].value = final_value;

    return (InterpretResult){.value = final_value, .has_error = false, .error_message = NULL};
}

// Helper: Try to parse an assignment as an expression (returns the assigned value)
// Returns error if this is not an assignment
static InterpretResult try_parse_assignment_expression(Parser *p)
{
    int saved_pos = p->pos;
    skip_whitespace(p);

    // Check for dereference assignment (*var = value)
    if (p->input[p->pos] == '*' && isalpha(p->input[p->pos + 1]))
    {
        p->pos++; // Skip '*'
        skip_whitespace(p);

        // Parse the pointer variable name
        char ptr_var_name[32];
        int ptr_var_len = parse_identifier(p, ptr_var_name, sizeof(ptr_var_name));
        if (ptr_var_len <= 0)
        {
            p->pos = saved_pos;
            return make_error("not_an_assignment");
        }

        skip_whitespace(p);

        // Check for assignment operator
        char compound_op = check_assignment_operator(p);
        if (compound_op == '\0')
        {
            p->pos = saved_pos;
            return make_error("not_an_assignment");
        }

        // Find the pointer variable
        int ptr_idx = find_variable(p, ptr_var_name, ptr_var_len);
        if (ptr_idx < 0)
        {
            return make_error("Variable not found");
        }

        // Check that it's a pointer variable
        if (!is_pointer_type(p->variables[ptr_idx].type))
        {
            return make_error("Cannot dereference non-pointer variable");
        }

        // Check that it's a mutable pointer (required for assignment through dereferencing)
        if (!is_mutable_pointer_type(p->variables[ptr_idx].type))
        {
            return make_error("Cannot assign through immutable pointer");
        }

        // Get the target variable index from pointer_target
        int target_idx = p->variables[ptr_idx].pointer_target;
        if (target_idx < 0 || target_idx >= p->var_count)
        {
            return make_error("Invalid pointer target");
        }

        // Check if the target variable is mutable
        if (!p->variables[target_idx].is_mutable)
        {
            return make_error("Cannot assign to immutable variable");
        }

        // Parse the assignment operator
        p->pos += (compound_op == '=' ? 1 : 2);
        skip_whitespace(p);

        // Parse RHS and calculate final value
        InterpretResult assign_result = parse_assignment_rhs(p, compound_op, p->variables[target_idx].value);
        if (assign_result.has_error)
            return assign_result;

        // Update the target variable's value
        p->variables[target_idx].value = assign_result.value;

        return (InterpretResult){.value = assign_result.value, .has_error = false, .error_message = NULL};
    }

    // Check for array element assignment (array[idx] = value)
    if (isalpha(p->input[p->pos]))
    {
        int name_pos = p->pos;
        char array_name[32];
        int array_name_len = parse_identifier(p, array_name, sizeof(array_name));
        if (array_name_len > 0)
        {
            skip_whitespace(p);
            if (p->input[p->pos] == '[')
            {
                int array_idx = find_variable(p, array_name, array_name_len);
                if (array_idx < 0)
                {
                    return make_error("Variable not found");
                }

                if (!p->variables[array_idx].is_array)
                {
                    return make_error("Cannot index non-array variable");
                }

                long index_value = 0;
                InterpretResult bracket_result = parse_bracket_index(p, &index_value);
                if (bracket_result.has_error)
                    return bracket_result;

                char compound_op = check_assignment_operator(p);
                if (compound_op == '\0')
                {
                    p->pos = saved_pos;
                    return make_error("not_an_assignment");
                }

                if (!p->variables[array_idx].is_mutable)
                {
                    return make_error("Cannot assign to immutable variable");
                }

                if (index_value < 0 || index_value >= p->variables[array_idx].array_total_count)
                {
                    return make_error("Array index out of bounds");
                }

                if (index_value > p->variables[array_idx].array_init_count)
                {
                    return make_error("Array elements must be initialized in order");
                }

                if (compound_op != '=' && index_value >= p->variables[array_idx].array_init_count)
                {
                    return make_error("Cannot use compound assignment on uninitialized element");
                }

                // Parse the assignment operator
                p->pos += (compound_op == '=' ? 1 : 2);
                skip_whitespace(p);

                // Parse RHS and calculate final value
                InterpretResult assign_result = parse_assignment_rhs(p, compound_op, p->variables[array_idx].array_values[index_value]);
                if (assign_result.has_error)
                    return assign_result;

                long final_value = assign_result.value;

                // Validate final value against array element type
                if (p->has_tracked_suffix && p->tracked_suffix[0] != '\0')
                {
                    if (!is_type_compatible(p->variables[array_idx].array_element_type, p->tracked_suffix))
                    {
                        return make_error("Array element type mismatch");
                    }
                }
                else
                {
                    InterpretResult validation = validate_type(final_value, p->variables[array_idx].array_element_type);
                    if (validation.has_error)
                        return validation;
                }

                p->variables[array_idx].array_values[index_value] = final_value;
                if (index_value == p->variables[array_idx].array_init_count)
                {
                    p->variables[array_idx].array_init_count++;
                }

                return (InterpretResult){.value = final_value, .has_error = false, .error_message = NULL};
            }
            p->pos = name_pos;
        }
    }

    // Try to parse a regular identifier assignment
    char var_name[32];
    int name_len = 0;
    if (!isalpha(p->input[p->pos]))
    {
        p->pos = saved_pos;
        return make_error("not_an_assignment");
    }

    name_len = parse_identifier(p, var_name, sizeof(var_name));

    // Check for '=', '+=', '-=', '*=', or '/=' (single equals, not ==)
    if (!check_assignment_operator(p))
    {
        p->pos = saved_pos;
        return make_error("not_an_assignment");
    }

    // This is an assignment - reset and parse it
    p->pos = saved_pos;
    name_len = parse_identifier(p, var_name, sizeof(var_name));

    // Parse and apply the assignment
    InterpretResult assign_result = parse_and_apply_assignment(p, var_name, name_len);
    if (assign_result.has_error)
        return assign_result;

    // Consume optional semicolon (for use in if-else branches like "x = 1;")
    skip_whitespace(p);
    if (p->input[p->pos] == ';')
    {
        p->pos++;
    }

    // Return the assigned value
    return assign_result;
}

static InterpretResult parse_assignment_statement_in_block(Parser *p)
{
    // Parse variable name
    char var_name[32];
    int name_len = 0;
    PARSE_VAR_NAME_OR_RETURN(p, var_name, name_len);

    // Parse and apply the assignment
    InterpretResult assign_result = parse_and_apply_assignment(p, var_name, name_len);
    if (assign_result.has_error)
        return assign_result;

    return finalize_statement(p, "Expected ';' after assignment");
}

// Helper: Parse a primary expression (number, variable reference, or parenthesized/braced expression)
static InterpretResult parse_primary(Parser *p, NumberValue *out_num)
{
    skip_whitespace(p);

    // Check for dereference operator (*pointer)
    // This must be distinguished from multiplication - we check if we're at the start of an operand
    if (p->input[p->pos] == '*' && !isdigit(p->input[p->pos + 1]))
    {
        // Might be a dereference operator (not multiplication)
        // We'll parse the following primary and check if it's a pointer type
        int saved_pos = p->pos;
        p->pos++; // Skip '*'

        // Parse the operand after *
        InterpretResult ptr_expr = parse_primary(p, out_num);
        if (ptr_expr.has_error)
        {
            p->pos = saved_pos;
            // Not a dereference, fall through to parsing as normal operand
        }
        else if (!p->has_tracked_suffix || !is_pointer_type(p->tracked_suffix))
        {
            // Not a pointer type, so * is an error (cannot dereference non-pointer)
            return make_error("Cannot dereference non-pointer value");
        }
        else
        {
            // This is a dereference operation on a pointer type
            // ptr_expr.value contains the variable index to dereference
            // p->tracked_suffix contains the pointer type like "*I32"

            // Extract the base type from the pointer type
            char base_type[16];
            extract_pointer_base_type(p->tracked_suffix, base_type, sizeof(base_type));

            // Validate the pointer index is valid
            if (ptr_expr.value < 0 || ptr_expr.value >= p->var_count)
            {
                return make_error("Invalid pointer dereference");
            }

            // Get the value from the pointed-to variable
            long deref_value = p->variables[ptr_expr.value].value;

            // Update tracked suffix to the dereferenced type
            strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), base_type, _TRUNCATE);
            p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
            p->has_tracked_suffix = 1;

            if (out_num)
                out_num->suffix_len = 0;

            return (InterpretResult){.value = (int)deref_value, .has_error = false, .error_message = NULL};
        }
    }

    if (p->input[p->pos] == '[')
    {
        return parse_array_literal(p);
    }

    if (p->input[p->pos] == '(' || p->input[p->pos] == '{')
    {
        // Parse parenthesized or braced expression
        char closing_char = p->input[p->pos] == '(' ? ')' : '}';
        int is_block = p->input[p->pos] == '{';
        int saved_var_count = p->var_count;
        p->pos++; // Skip '(' or '{'

        // For blocks, check for let statements
        if (is_block)
        {
            InterpretResult let_statements_result = parse_let_statements_loop(p);
            if (let_statements_result.has_error)
            {
                p->var_count = saved_var_count;
                return let_statements_result;
            }
        }

        skip_whitespace(p);

        // Check if the block/parens is empty
        if (p->input[p->pos] == closing_char)
        {
            // Empty block/parens, return 0
            p->pos++; // Skip ')' or '}'

            // Before restoring variable scope, preserve mutations to outer-scope variables
            if (is_block)
            {
                // Copy back the values of outer-scope variables (0 to saved_var_count-1)
                // to preserve any mutations that occurred in the block
                for (int i = 0; i < saved_var_count; i++)
                {
                    // Values in p->variables[i] are already updated, var_count will be reset
                    // The values persist because they're stored directly in the array
                }
            }

            // Restore variable scope
            p->var_count = saved_var_count;

            return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
        }

        // Parse the inner expression (can be assignment, if-else, or other expressions)
        InterpretResult result = parse_assignment_or_if_else(p);
        if (result.has_error)
        {
            p->var_count = saved_var_count;
            return result;
        }

        skip_whitespace(p);

        // Expect closing bracket
        if (p->input[p->pos] != closing_char)
        {
            p->var_count = saved_var_count;
            return make_error(closing_char == ')' ? "Expected closing parenthesis" : "Expected closing brace");
        }
        p->pos++; // Skip ')' or '}'

        // Before restoring variable scope, preserve mutations to outer-scope variables
        if (is_block)
        {
            // Copy back the values of outer-scope variables (0 to saved_var_count-1)
            // to preserve any mutations that occurred in the block
            for (int i = 0; i < saved_var_count; i++)
            {
                // The variable at index i may have been modified in the block
                // We keep its current value, don't restore the old one
                // (no action needed - values are already updated)
            }
        }

        // Restore variable scope
        p->var_count = saved_var_count;

        // Return result with no type suffix (parenthesized/braced expressions don't have suffixes)
        if (out_num)
            out_num->suffix_len = 0;

        return result;
    }

    // Parse a simple operand (number or variable reference)
    return parse_simple_operand(p, out_num);
}

static InterpretResult parse_multiplicative(Parser *p, NumberValue *out_first_num)
{
    skip_whitespace(p);

    // Parse first primary (number or parenthesized expression) and validate it
    InterpretResult left = parse_primary(p, out_first_num);
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

// Type definition for single-argument operand parser function
typedef InterpretResult (*BinaryOpParser)(Parser *p);

// Helper: Parse binary logical operation with custom operand parser
static InterpretResult parse_binary_logical_op_generic(Parser *p, char op_char, int is_or, BinaryOpParser operand_parser)
{
    skip_whitespace(p);

    InterpretResult left = operand_parser(p);
    if (left.has_error)
        return left;

    skip_whitespace(p);

    // Look for operator (both && and || repeat the character)
    int found_operator = 0;
    while (p->input[p->pos] == op_char && p->input[p->pos + 1] == op_char)
    {
        found_operator = 1;

        // Validate left operand is boolean (only when we actually have the operator)
        if (strcmp(p->tracked_suffix, "Bool") != 0)
            return make_error("Operand must be a boolean value");

        p->pos += 2;
        skip_whitespace(p);

        // Parse right operand
        InterpretResult right = operand_parser(p);
        if (right.has_error)
            return right;

        // Validate right operand is boolean
        if (strcmp(p->tracked_suffix, "Bool") != 0)
            return make_error("Operand must be a boolean value");

        // Evaluate operation
        long result;
        if (is_or)
            result = (left.value != 0) || (right.value != 0) ? 1 : 0;
        else // AND
            result = (left.value != 0) && (right.value != 0) ? 1 : 0;

        left = (InterpretResult){.value = result, .has_error = false, .error_message = NULL};

        skip_whitespace(p);
    }

    // Result of AND/OR is boolean only if we found the operator
    if (found_operator)
    {
        strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), "Bool", _TRUNCATE);
        p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
        p->has_tracked_suffix = 1;
    }

    return left;
}

// Helper: Parse comparison operators (<, >, <=, >=, ==, !=)
static InterpretResult parse_comparison(Parser *p)
{
    skip_whitespace(p);

    // Parse first additive term
    InterpretResult left = parse_additive(p);
    if (left.has_error)
        return left;

    skip_whitespace(p);

    // Check for comparison operators
    int is_comparison = 0;
    int is_two_char = 0;
    char op1 = '\0';
    char op = '\0';
    long result = 0;

    // Check for two-character operators first (<=, >=, ==, !=)
    if (p->input[p->pos] && p->input[p->pos + 1])
    {
        char curr = p->input[p->pos];
        char next = p->input[p->pos + 1];

        if ((curr == '<' || curr == '>' || curr == '=' || curr == '!') && next == '=')
        {
            is_two_char = 1;
            is_comparison = 1;
            op1 = curr;
            p->pos += 2;
            skip_whitespace(p);
        }
    }

    // If not two-char, check for single-character operators (< or >)
    if (!is_comparison && (p->input[p->pos] == '<' || p->input[p->pos] == '>'))
    {
        is_comparison = 1;
        op = p->input[p->pos];
        p->pos++;
        skip_whitespace(p);
    }

    if (is_comparison)
    {
        // Check that left operand is not a boolean
        if (p->has_tracked_suffix && strcmp(p->tracked_suffix, "Bool") == 0)
        {
            return make_error("Boolean values cannot be used in comparison operations");
        }

        // Parse right operand
        InterpretResult right = parse_additive(p);
        if (right.has_error)
            return right;

        // Check that right operand is not a boolean
        if (p->has_tracked_suffix && strcmp(p->tracked_suffix, "Bool") == 0)
        {
            return make_error("Boolean values cannot be used in comparison operations");
        }

        // Perform comparison
        if (is_two_char)
        {
            if (op1 == '<')
                result = left.value <= right.value ? 1 : 0; // <=
            else if (op1 == '>')
                result = left.value >= right.value ? 1 : 0; // >=
            else if (op1 == '=')
                result = left.value == right.value ? 1 : 0; // ==
            else if (op1 == '!')
                result = left.value != right.value ? 1 : 0; // !=
        }
        else
        {
            if (op == '<')
                result = left.value < right.value ? 1 : 0;
            else if (op == '>')
                result = left.value > right.value ? 1 : 0;
        }

        // Set Bool type for result and return
        set_bool_tracked_suffix(p);
        return (InterpretResult){.value = (int)result, .has_error = false, .error_message = NULL};
    }

    // No comparison operator, return left operand as-is
    return left;
}

// Helper: Parse binary logical operation (AND or OR)
static InterpretResult parse_logical_binary_op(Parser *p, char op_char, int is_or)
{
    return parse_binary_logical_op_generic(p, op_char, is_or, parse_comparison);
}

// Helper: Parse logical AND operator (higher precedence than OR)
static InterpretResult parse_logical_and(Parser *p)
{
    return parse_logical_binary_op(p, '&', 0);
}

// Helper: Parse logical OR operator (lowest precedence)
static InterpretResult parse_logical_or(Parser *p)
{
    return parse_binary_logical_op_generic(p, '|', 1, parse_logical_and);
}

// Helper: Parse shared if-condition header and save state
// Parses: if (condition)
// Helper: Parse keyword followed by '(' and expect opening paren - used by both if and match parsing
static InterpretResult parse_keyword_header(Parser *p, const char *keyword, int keyword_len, const char *context_msg)
{
    skip_whitespace(p);

    if (!is_keyword_at(p, keyword))
    {
        return make_error(context_msg);
    }

    p->pos += keyword_len; // Skip keyword

    InterpretResult open_paren = expect_char(p, '(', "Expected '(' after keyword");
    if (open_paren.has_error)
        return open_paren;
    skip_whitespace(p);

    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

static InterpretResult parse_if_header(Parser *p, InterpretResult *condition, Variable saved_vars[10], int *saved_var_count)
{
    InterpretResult header = parse_keyword_header(p, "if", 2, "Expected 'if' keyword");
    if (header.has_error)
        return header;

    *condition = parse_logical_or(p);
    if (condition->has_error)
        return *condition;

    if (!p->has_tracked_suffix || strcmp(p->tracked_suffix, "Bool") != 0)
    {
        return make_error("if-else condition must be a boolean value");
    }

    InterpretResult close_paren = expect_char(p, ')', "Expected ')' after if condition");
    if (close_paren.has_error)
        return close_paren;
    skip_whitespace(p);

    save_variable_state(p, saved_vars, saved_var_count);

    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

typedef struct
{
    InterpretResult header;
    InterpretResult condition;
    Variable saved_vars[10];
    int saved_var_count;
} IfHeaderState;

static IfHeaderState parse_if_header_state(Parser *p)
{
    IfHeaderState state = {0};
    state.header = parse_if_header(p, &state.condition, state.saved_vars, &state.saved_var_count);
    return state;
}

// Helper: Parse if-statement at statement level (not as expression)
// This handles if statements as standalone statements
// Unlike parse_if_else, we want to keep mutations from the taken branch
static InterpretResult parse_if_statement(Parser *p)
{
    IfHeaderState header_state = parse_if_header_state(p);
    if (header_state.header.has_error)
        return header_state.header;

    // If condition is true, execute the then branch (keeping mutations)
    // If condition is false, execute it but then restore state
    if (header_state.condition.value != 0)
    {
        // Parse and execute the then statement (mutations are kept)
        InterpretResult then_result = parse_assignment_or_if_else(p);
        if (then_result.has_error)
            return then_result;
    }
    else
    {
        // Condition is false: parse then branch but restore state (discard mutations)
        InterpretResult then_result = parse_assignment_or_if_else(p);
        if (then_result.has_error)
            return then_result;
        // Restore the saved variable state (undo then branch mutations)
        restore_saved_vars(p, header_state.saved_vars, header_state.saved_var_count);
    }

    skip_whitespace(p);

    // Check for optional else clause
    if (is_keyword_at(p, "else"))
    {
        p->pos += 4; // Skip 'else'
        skip_whitespace(p);

        // Save current state before else (in case condition was true)
        Variable saved_vars_before_else[10];
        int saved_var_count_before_else = p->var_count;
        for (int i = 0; i < p->var_count; i++)
        {
            saved_vars_before_else[i] = p->variables[i];
        }

        if (header_state.condition.value == 0)
        {
            // Condition was false, so execute the else branch (keeping mutations)
            InterpretResult else_result = parse_assignment_or_if_else(p);
            if (else_result.has_error)
                return else_result;
        }
        else
        {
            // Condition was true, parse else but restore state (discard mutations)
            InterpretResult else_result = parse_assignment_or_if_else(p);
            if (else_result.has_error)
                return else_result;
            // Restore the state before the else (undo else branch mutations)
            p->var_count = saved_var_count_before_else;
            for (int i = 0; i < saved_var_count_before_else; i++)
            {
                p->variables[i] = saved_vars_before_else[i];
            }
        }

        skip_whitespace(p);
    }

    // If-statement returns 0 (statements don't have values)
    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Helper: Parse while statement
// Syntax: while (condition) body
static InterpretResult parse_while_statement(Parser *p)
{
    InterpretResult header = parse_keyword_header(p, "while", 5, "Expected 'while' keyword");
    if (header.has_error)
        return header;

    // Save position before condition
    int cond_start_pos = p->pos;

    // Parse condition expression
    InterpretResult cond_result = parse_logical_or(p);
    if (cond_result.has_error)
        return cond_result;

    // Validate condition is boolean
    if (!p->has_tracked_suffix || strcmp(p->tracked_suffix, "Bool") != 0)
    {
        return make_error("while condition must be a boolean value");
    }

    // Expect closing parenthesis
    InterpretResult close_paren = expect_closing_paren(p, "while condition");
    if (close_paren.has_error)
        return close_paren;

    // Save position where body starts
    LoopState loop_state = init_loop_state(p);
    int body_start_pos = loop_state.body_start_pos;
    int body_end_pos = loop_state.body_end_pos;

    // Execute while loop with iteration cap
    static const int MAX_ITERATIONS = 1024;

    for (int iter = 0; iter < MAX_ITERATIONS; iter++)
    {
        // Reset to condition start and re-evaluate condition
        int saved_pos = p->pos;
        p->pos = cond_start_pos;

        // Re-parse condition
        InterpretResult loop_cond = parse_logical_or(p);
        if (loop_cond.has_error)
            return loop_cond;

        // If condition is false, break
        if (loop_cond.value == 0)
        {
            // If first iteration and body hasn't been parsed yet, parse it to skip past it
            // But save/restore variable state since condition is false
            if (iter == 0)
            {
                body_end_pos = parse_and_skip_body_restoring_state(p, body_start_pos);
                if (body_end_pos == -1)
                    return make_error("Error parsing loop body");
            }
            else
            {
                p->pos = body_end_pos;
            }
            break;
        }

        // Condition is true, reset to body start and execute body
        p->pos = body_start_pos;
        InterpretResult body_result = parse_assignment_or_if_else(p);
        if (body_result.has_error)
            return body_result;

        // Save position after body execution for next condition check
        body_end_pos = p->pos;
    }

    // While loop returns 0 (statements don't have values)
    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Helper: Parse for loop
// Syntax: for (identifier in start..end) body
static InterpretResult parse_for_statement(Parser *p)
{
    InterpretResult header = parse_keyword_header(p, "for", 3, "Expected 'for' keyword");
    if (header.has_error)
        return header;

    // Parse loop variable name
    char loop_var_name[32];
    int name_len = parse_identifier(p, loop_var_name, sizeof(loop_var_name));
    if (name_len <= 0)
    {
        return make_error("Expected loop variable name in for loop");
    }
    skip_whitespace(p);

    // Expect 'in' keyword
    if (!is_keyword_at(p, "in"))
    {
        return make_error("Expected 'in' keyword in for loop");
    }
    p->pos += 2; // Skip 'in'
    skip_whitespace(p);

    // Parse start value
    InterpretResult start_result = parse_additive(p);
    if (start_result.has_error)
        return start_result;
    long start_value = start_result.value;

    // Expect '..' operator
    InterpretResult range_op = expect_range_operator(p);
    if (range_op.has_error)
        return range_op;

    // Parse end value
    InterpretResult end_result = parse_additive(p);
    if (end_result.has_error)
        return end_result;
    long end_value = end_result.value;
    skip_whitespace(p);

    // Expect closing parenthesis
    InterpretResult close_paren = expect_closing_paren(p, "for loop range");
    if (close_paren.has_error)
        return close_paren;

    // Save position where body starts
    LoopState loop_state = init_loop_state(p);
    int body_start_pos = loop_state.body_start_pos;
    int body_end_pos = loop_state.body_end_pos;

    // Execute for loop with iteration cap
    static const int MAX_ITERATIONS = 1024;

    // Check that loop variable hasn't been declared before
    if (has_variable_been_declared(p, loop_var_name, name_len))
    {
        return make_error("Variable already declared");
    }

    for (long i = start_value; i < end_value && (i - start_value) < MAX_ITERATIONS; i++)
    {
        // Set loop variable to current value (immutable, typeless)
        set_variable(p, loop_var_name, name_len, i);

        // Parse body on first iteration to find end position
        if (i == start_value)
        {
            p->pos = body_start_pos;
            InterpretResult body_result = parse_assignment_or_if_else(p);
            if (body_result.has_error)
                return body_result;
            body_end_pos = p->pos;
        }
        else
        {
            // Subsequent iterations: reset to body start and execute
            p->pos = body_start_pos;
            InterpretResult body_result = parse_assignment_or_if_else(p);
            if (body_result.has_error)
                return body_result;
            body_end_pos = p->pos;
        }
    }

    // If loop didn't execute (start >= end), we still need to parse the body to skip past it
    if (start_value >= end_value)
    {
        body_end_pos = parse_and_skip_body_restoring_state(p, body_start_pos);
        if (body_end_pos == -1)
            return make_error("Error parsing loop body");
    }

    // Set position to end of body for next parsing
    p->pos = body_end_pos;

    // For loop returns 0 (statements don't have values)
    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Helper: Parse assignment or if-else expression (for use in if-else branches)
// Tries to parse an assignment first, falls back to if-else
static InterpretResult parse_assignment_or_if_else(Parser *p)
{
    // Try to parse an assignment expression
    InterpretResult assign_result = try_parse_assignment_expression(p);
    if (!assign_result.has_error)
    {
        // It was an assignment, return the result
        return assign_result;
    }

    // Check if this is actually "not an assignment" or a real error in parsing
    // Only fall back to if-else if it's not an assignment, not for other errors
    if (assign_result.error_message && strcmp(assign_result.error_message, "not_an_assignment") == 0)
    {
        // Not an assignment, parse as if-else (which delegates to match then logical_or as needed)
        return parse_if_else(p);
    }

    // Real error (e.g., immutable variable), propagate it
    return assign_result;
}

// Helper: Apply branch state after executing an if/else branch
static InterpretResult apply_branch_state(Parser *p, Variable then_state_vars[10], int then_state_var_count, InterpretResult then_expr)
{
    p->var_count = then_state_var_count;
    for (int i = 0; i < then_state_var_count; i++)
    {
        p->variables[i] = then_state_vars[i];
    }
    return (InterpretResult){.value = then_expr.value, .has_error = false, .error_message = NULL};
}

// Helper: Parse boolean pattern (true/false) with type validation
// Returns pattern_value (1 for true, 0 for false) or error if type mismatch
static InterpretResult parse_bool_pattern(Parser *p, int match_value_is_bool, long *out_pattern_value)
{
    if (is_keyword_at(p, "true"))
    {
        // Validate: boolean patterns require boolean match values
        if (!match_value_is_bool)
        {
            return make_error("Cannot match boolean patterns against numeric value");
        }
        *out_pattern_value = 1;
        p->pos += 4; // Skip 'true'
        return (InterpretResult){.value = 1, .has_error = false, .error_message = NULL};
    }
    else if (is_keyword_at(p, "false"))
    {
        // Validate: boolean patterns require boolean match values
        if (!match_value_is_bool)
        {
            return make_error("Cannot match boolean patterns against numeric value");
        }
        *out_pattern_value = 0;
        p->pos += 5; // Skip 'false'
        return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
    }
    return make_error("Expected boolean pattern (true or false)");
}

// Helper: Parse match expression
// Syntax: match (value) { case pattern => result; case pattern => result; ... case _ => default; }
static InterpretResult parse_match(Parser *p)
{
    if (!is_keyword_at(p, "match"))
    {
        // Not a match expression, parse as logical or
        return parse_logical_or(p);
    }

    InterpretResult header = parse_keyword_header(p, "match", 5, "Expected 'match' keyword");
    if (header.has_error)
        return header;

    // Parse the match value/condition
    InterpretResult match_value = parse_logical_or(p);
    if (match_value.has_error)
        return match_value;

    // Determine match value type (boolean or numeric)
    int match_value_is_bool = (p->has_tracked_suffix && strcmp(p->tracked_suffix, "Bool") == 0);

    // Expect closing parenthesis
    InterpretResult close_paren = expect_char(p, ')', "Expected ')' after match condition");
    if (close_paren.has_error)
        return close_paren;
    skip_whitespace(p);

    // Expect opening brace
    InterpretResult open_brace = expect_char(p, '{', "Expected '{' after match condition");
    if (open_brace.has_error)
        return open_brace;
    skip_whitespace(p);

    // Parse case branches
    InterpretResult wildcard_result = {.value = 0, .has_error = true, .error_message = NULL};
    int found_match = 0;
    InterpretResult match_result = {.value = 0, .has_error = true, .error_message = NULL};
    int has_non_wildcard_cases = 0;

    while (p->input[p->pos] && p->input[p->pos] != '}')
    {
        skip_whitespace(p);

        // Expect "case" keyword
        if (!is_keyword_at(p, "case"))
        {
            return make_error("Expected 'case' keyword in match expression");
        }
        p->pos += 4; // Skip 'case'
        skip_whitespace(p);

        // Parse pattern (either a number, boolean literal, or wildcard _)
        int is_wildcard = 0;
        long pattern_value = 0;

        if (p->input[p->pos] == '_')
        {
            is_wildcard = 1;
            p->pos++;
        }
        else if (is_keyword_at(p, "true") || is_keyword_at(p, "false"))
        {
            // Boolean pattern: true/false
            has_non_wildcard_cases = 1;
            InterpretResult bool_pattern_result = parse_bool_pattern(p, match_value_is_bool, &pattern_value);
            if (bool_pattern_result.has_error)
                return bool_pattern_result;
        }
        else if (isdigit(p->input[p->pos]))
        {
            // Parse numeric pattern
            has_non_wildcard_cases = 1;

            // Validate: numeric patterns require numeric match values
            if (match_value_is_bool)
            {
                return make_error("Cannot match numeric patterns against boolean value");
            }

            pattern_value = 0;
            while (isdigit(p->input[p->pos]))
            {
                pattern_value = pattern_value * 10 + (p->input[p->pos] - '0');
                p->pos++;
            }
        }
        else
        {
            return make_error("Expected pattern in case (number, true, false, or _)");
        }

        skip_whitespace(p);

        // Expect '=>'
        if (p->input[p->pos] != '=' || p->input[p->pos + 1] != '>')
        {
            return make_error("Expected '=>' in case branch");
        }
        p->pos += 2;
        skip_whitespace(p);

        // Parse the result expression
        InterpretResult case_result = parse_logical_or(p);
        if (case_result.has_error)
            return case_result;

        skip_whitespace(p);

        // Expect semicolon
        if (p->input[p->pos] != ';')
        {
            return make_error("Expected ';' after case result");
        }
        p->pos++;
        skip_whitespace(p);

        // Check if this case matches
        if (!found_match)
        {
            if (is_wildcard)
            {
                // Save wildcard result as fallback
                wildcard_result = case_result;
            }
            else if (pattern_value == match_value.value)
            {
                // Found a matching case
                found_match = 1;
                match_result = case_result;
            }
        }
    }

    // Expect closing brace
    if (p->input[p->pos] != '}')
    {
        return make_error("Expected '}' after match cases");
    }
    p->pos++;

    // Return the matched result or wildcard result
    if (found_match)
    {
        return match_result;
    }
    else if (!wildcard_result.has_error)
    {
        return wildcard_result;
    }
    else
    {
        return make_error("No matching case in match expression");
    }
}

// Helper: Parse if-else expression
// Syntax: if (condition) then_expr else else_expr
static InterpretResult parse_if_else(Parser *p)
{
    if (!is_keyword_at(p, "if"))
    {
        // Not an if expression, parse as match
        return parse_match(p);
    }

    IfHeaderState header_state = parse_if_header_state(p);
    if (header_state.header.has_error)
        return header_state.header;

    // Parse and execute then expression
    InterpretResult then_expr = parse_assignment_or_if_else(p);
    if (then_expr.has_error)
        return then_expr;

    // Capture the type of the then branch
    char then_type[8] = {0};
    int then_has_type = p->has_tracked_suffix;
    if (p->has_tracked_suffix)
    {
        strncpy_s(then_type, sizeof(then_type), p->tracked_suffix, _TRUNCATE);
        then_type[sizeof(then_type) - 1] = '\0';
    }

    // Save the state after executing then branch
    Variable then_state_vars[10];
    int then_state_var_count = p->var_count;
    for (int i = 0; i < p->var_count; i++)
    {
        then_state_vars[i] = p->variables[i];
    }

    // Restore pre-then state before executing else
    restore_saved_vars(p, header_state.saved_vars, header_state.saved_var_count);

    skip_whitespace(p);

    // Check if 'else' keyword is present (optional)
    if (is_keyword_at(p, "else"))
    {
        // else clause is present, parse it
        p->pos += 4; // Skip 'else'
        skip_whitespace(p);

        // Parse and execute else expression
        InterpretResult else_expr = parse_assignment_or_if_else(p);
        if (else_expr.has_error)
            return else_expr;

        // Capture the type of the else branch
        char else_type[8] = {0};
        int else_has_type = p->has_tracked_suffix;
        if (p->has_tracked_suffix)
        {
            strncpy_s(else_type, sizeof(else_type), p->tracked_suffix, _TRUNCATE);
            else_type[sizeof(else_type) - 1] = '\0';
        }

        // Check that both branches have the same type
        if (then_has_type != else_has_type)
        {
            return make_error("if-else branches must have the same type");
        }

        if (then_has_type && strncmp(then_type, else_type, sizeof(then_type)) != 0)
        {
            return make_error("if-else branches must have the same type");
        }

        // Now apply the correct mutations based on condition
        if (header_state.condition.value != 0)
        {
            // Condition is true, use then branch state
            return apply_branch_state(p, then_state_vars, then_state_var_count, then_expr);
        }
        else
        {
            // Condition is false, use else branch state (already applied)
            return (InterpretResult){.value = else_expr.value, .has_error = false, .error_message = NULL};
        }
    }
    else
    {
        // No else clause - this is an optional if statement
        // If condition is true, use then branch state
        // If condition is false, use original pre-condition state (then branch was never executed)
        if (header_state.condition.value != 0)
        {
            // Condition is true, use then branch state
            return apply_branch_state(p, then_state_vars, then_state_var_count, then_expr);
        }
        else
        {
            // Condition is false, don't apply then branch, return pre-condition state
            restore_saved_vars(p, header_state.saved_vars, header_state.saved_var_count);
            // For if-only (no else), return 0 when condition is false
            return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
        }
    }
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
    char tracked_suffix[16] = {0}; // Increased to accommodate "*mut I32"
    char last_suffix[16] = {0};    // Increased to accommodate "*mut I8"
    int has_tracked_suffix = 0;
    int in_mixed_types = 0; // Track if we've seen mixed types

    if (first_num.suffix_len > 0)
    {
        strncpy_s(tracked_suffix, sizeof(tracked_suffix), first_num.suffix, first_num.suffix_len);
        tracked_suffix[first_num.suffix_len] = '\0';
        strncpy_s(last_suffix, sizeof(last_suffix), first_num.suffix, first_num.suffix_len);
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

        // Reject boolean operands in arithmetic operations - only reject when operators are found
        if (first_num.suffix_len == 4 && first_num.suffix != NULL)
        {
            if (strncmp(first_num.suffix, "Bool", 4) == 0)
            {
                return make_error("Boolean values cannot be used in arithmetic operations");
            }
        }
        if (right_num.suffix_len == 4 && right_num.suffix != NULL)
        {
            if (strncmp(right_num.suffix, "Bool", 4) == 0)
            {
                return make_error("Boolean values cannot be used in arithmetic operations");
            }
        }
        if (right_num.suffix_len == 4 && right_num.suffix != NULL &&
            strncmp(right_num.suffix, "Bool", 4) == 0)
        {
            return make_error("Boolean values cannot be used in arithmetic operations");
        }

        // Track last suffix if this operand has one
        if (right_num.suffix_len > 0)
        {
            strncpy_s(last_suffix, sizeof(last_suffix), right_num.suffix, right_num.suffix_len);
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

    // Update the Parser struct with the tracked suffix information
    if (has_tracked_suffix)
    {
        strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), tracked_suffix, _TRUNCATE);
        p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
        p->has_tracked_suffix = 1;
    }
    else
    {
        p->has_tracked_suffix = 0;
    }

    return (InterpretResult){.value = (int)result_value, .has_error = false, .error_message = NULL};
}

// Helper: Pre-scan for top-level function declarations and register them
// This allows forward references to functions that are declared later
static InterpretResult prescan_function_declarations(Parser *p)
{
    // Save starting position and reset to beginning
    int starting_pos = p->pos;
    p->pos = 0;
    skip_whitespace(p);

    // Scan entire input for all function declarations
    while (p->input[p->pos])
    {
        skip_whitespace(p);

        // Check if we're at a function declaration
        if (is_keyword_at(p, "fn"))
        {
            // Parse the function declaration to register it
            InterpretResult fn_result = parse_function_declaration(p);
            if (fn_result.has_error)
                return fn_result;
            skip_whitespace(p);
        }
        else
        {
            // Not a function declaration at this position
            // Skip this statement and continue scanning for more functions
            // Skip until we find a semicolon (end of statement) or closing brace
            int brace_depth = 0;
            while (p->input[p->pos])
            {
                if (p->input[p->pos] == '{')
                {
                    brace_depth++;
                }
                else if (p->input[p->pos] == '}')
                {
                    brace_depth--;
                    p->pos++;
                    break;
                }
                else if (p->input[p->pos] == ';' && brace_depth == 0)
                {
                    p->pos++;
                    break;
                }
                p->pos++;
            }
            skip_whitespace(p);
        }
    }

    // Restore position to beginning for normal parsing
    p->pos = 0;

    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

static InterpretResult parse_expression(Parser *p)
{
    // Pre-scan for all top-level function declarations
    // This allows forward references to functions declared later
    InterpretResult prescan_result = prescan_function_declarations(p);
    if (prescan_result.has_error)
        return prescan_result;

    // Check for top-level let statements and blocks
    InterpretResult let_statements_result = parse_let_statements_loop(p);
    if (let_statements_result.has_error)
        return let_statements_result;

    // Skip whitespace to check if there's anything left
    int save_pos = p->pos;
    skip_whitespace(p);
    int has_remaining = (p->input[p->pos] != '\0');
    p->pos = save_pos;

    // If there's remaining input, parse it as the final expression
    // Otherwise, return the result from parse_let_statements_loop
    if (has_remaining)
    {
        // Parse the final expression (can be if-else, match, logical OR, or other expressions)
        return parse_if_else(p);
    }
    else
    {
        // No remaining expression, return the value from let statements/blocks
        return let_statements_result;
    }
}

static int is_keyword_lookahead(const char *str, const char *keyword, int keyword_len)
{
    return strncmp(str, keyword, keyword_len) == 0 &&
           (isspace(str[keyword_len]) || str[keyword_len] == '(' || str[keyword_len] == '\0');
}

static int is_expression(const char *str)
{
    int in_number = 0;
    int in_identifier = 0;

    // Skip leading whitespace
    while (isspace(*str))
        str++;

    // Check if it's a let statement
    if (is_keyword_lookahead(str, "let", 3))
    {
        return 1;
    }

    // Check for if expression
    if (is_keyword_lookahead(str, "if", 2))
    {
        return 1;
    }

    // Check for match expression
    if (is_keyword_lookahead(str, "match", 5))
    {
        return 1;
    }

    // Check for boolean literals
    if (strncmp(str, "true", 4) == 0 && (isspace(str[4]) || str[4] == '\0' || !isalnum(str[4])))
    {
        return 1;
    }
    if (strncmp(str, "false", 5) == 0 && (isspace(str[5]) || str[5] == '\0' || !isalnum(str[5])))
    {
        return 1;
    }

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
        else if (str[i] == '<' || str[i] == '>')
        {
            // Comparison operators < > <= >=
            if (in_number || in_identifier)
                return 1;
        }
        else if ((str[i] == '=' || str[i] == '!') && str[i + 1] == '=')
        {
            // Comparison operators == !=
            return 1;
        }
        else if (str[i] == '=' && in_identifier)
        {
            // Assignment statement (variable = value)
            return 1;
        }
        else if (str[i] == '|' && str[i + 1] == '|')
        {
            // Logical OR operator
            return 1;
        }
        else if (str[i] == '&' && str[i + 1] == '&')
        {
            // Logical AND operator
            return 1;
        }
        else if (str[i] == '(' || str[i] == ')' || str[i] == '{' || str[i] == '}' || str[i] == '[' || str[i] == ']')
        {
            return 1;
        }
        else if (str[i] == '.')
        {
            return 1;
        }
        else if (isdigit(str[i]))
        {
            in_number = 1;
        }
        else if (isalpha(str[i]) || str[i] == '_')
        {
            in_identifier = 1;
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
        Parser p = {
            .input = str,
            .pos = 0,
            .last_error = {0},
            .tracked_suffix = {0},
            .has_tracked_suffix = 0,
            .variables = {0},
            .var_count = 0,
            .all_declared_names = {0},
            .all_declared_count = 0,
            .has_temp_array = 0,
            .temp_array_count = 0,
            .temp_array_element_type = {0},
            .temp_array_values = {0},
            .declared_functions = {0},
            .declared_functions_count = 0,
            .functions = {0},
            .functions_count = 0,
            .has_temp_struct = 0,
            .temp_struct_def_idx = -1,
            .temp_struct_values = {0},
            .declared_structs = {0},
            .declared_structs_count = 0,
            .structs = {0},
            .structs_count = 0};
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
