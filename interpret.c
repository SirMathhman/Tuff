#include "interpret.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

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
    char type[8];   // Store variable's type (e.g., "U8", "U16", empty if typeless)
    int is_mutable; // 1 if mutable, 0 if immutable
} Variable;

typedef struct
{
    const char *input;
    int pos;
    InterpretResult last_error;
    char tracked_suffix[8]; // Increased to accommodate "Bool" (4 chars + null)
    int has_tracked_suffix;
    Variable variables[10];
    int var_count;
    char all_declared_names[10][32]; // Track all variable names ever declared
    int all_declared_count;          // Count of all declared names
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

// Helper: Check if a source type can be assigned to a destination type
// Returns 1 if compatible, 0 if not
static int is_type_compatible(const char *dest_type, const char *source_type)
{
    if (!dest_type || !source_type || !dest_type[0] || !source_type[0])
        return 0;

    // Check for Bool type (special case)
    if (strcmp(dest_type, "Bool") == 0 && strcmp(source_type, "Bool") == 0)
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

// Helper: Parse a simple operand (number or variable reference)
static InterpretResult parse_simple_operand(Parser *p, NumberValue *out_num)
{
    skip_whitespace(p);

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

// Helper: Check if a variable name was ever declared (across all scopes)
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

// Helper: Set or add a variable with optional type information
// Helper: Set or add a variable with optional type and mutability information
static int set_variable_with_mutability(Parser *p, const char *name, int name_len, long value, const char *type, int is_mutable)
{
    int idx = find_variable(p, name, name_len);
    if (idx >= 0)
    {
        p->variables[idx].value = value;
        p->variables[idx].is_mutable = is_mutable;
        if (type && type[0])
        {
            strncpy_s(p->variables[idx].type, sizeof(p->variables[idx].type), type, _TRUNCATE);
            p->variables[idx].type[sizeof(p->variables[idx].type) - 1] = '\0';
        }
        return idx;
    }

    if (p->var_count >= 10)
        return -1; // Too many variables

    strncpy_s(p->variables[p->var_count].name, sizeof(p->variables[p->var_count].name), name, name_len);
    p->variables[p->var_count].name[name_len] = '\0';
    p->variables[p->var_count].value = value;
    p->variables[p->var_count].is_mutable = is_mutable;
    if (type && type[0])
    {
        strncpy_s(p->variables[p->var_count].type, sizeof(p->variables[p->var_count].type), type, _TRUNCATE);
        p->variables[p->var_count].type[sizeof(p->variables[p->var_count].type) - 1] = '\0';
    }
    else
    {
        p->variables[p->var_count].type[0] = '\0';
    }

    // Track this name in the all_declared_names array for duplicate checking across scopes
    if (p->all_declared_count < 10)
    {
        strncpy_s(p->all_declared_names[p->all_declared_count], sizeof(p->all_declared_names[p->all_declared_count]), name, name_len);
        p->all_declared_names[p->all_declared_count][name_len] = '\0';
        p->all_declared_count++;
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
static InterpretResult parse_assignment_or_if_else(Parser *p);
static InterpretResult parse_assignment_statement_in_block(Parser *p);
static int has_assignment_operator(Parser *p);

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
    char declared_type[8] = {0};

    // Check if this is a typed or typeless declaration
    if (p->input[p->pos] == '=')
    {
        // Typeless declaration: let x = value;
        p->pos++; // Skip '='
        skip_whitespace(p);
    }
    else if (p->input[p->pos] == ':')
    {
        // Typed declaration: let x : Type = value;
        p->pos++; // Skip ':'
        skip_whitespace(p);

        // Parse type
        char type_name[8];
        InterpretResult type_result = parse_identifier_or_error(p, type_name, sizeof(type_name), "Expected type name");
        if (type_result.has_error)
            return type_result;

        // Store the declared type for validation later
        strncpy_s(declared_type, sizeof(declared_type), type_name, _TRUNCATE);
        declared_type[sizeof(declared_type) - 1] = '\0';

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

    // If declared type is specified, validate that the value matches the type
    if (declared_type[0] != '\0')
    {
        // Only validate if the value has a type suffix
        if (p->has_tracked_suffix)
        {
            // Check if the value's type is compatible with the declared type
            if (!is_type_compatible(declared_type, p->tracked_suffix))
            {
                return make_error("Variable type mismatch: declared type does not match assigned value type");
            }
        }
        else if (strcmp(declared_type, "Bool") == 0)
        {
            // Untyped values (e.g. plain numbers) are not compatible with Bool
            return make_error("Variable type mismatch: declared type does not match assigned value type");
        }
        // If value has no suffix and declared type is not Bool, it's compatible with any declared type
        // Store variable with declared type
        set_variable_with_mutability(p, var_name, name_len, val_result.value, declared_type, is_mutable);
    }
    else if (p->has_tracked_suffix)
    {
        // No declared type, but value has a type - store with value's type
        set_variable_with_mutability(p, var_name, name_len, val_result.value, p->tracked_suffix, is_mutable);
    }
    else
    {
        // No declared type, typeless value
        set_variable_with_mutability(p, var_name, name_len, val_result.value, NULL, is_mutable);
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
        // Check for assignment statement (identifier followed by '=')
        else if (isalpha(p->input[p->pos]) && !is_keyword_at(p, "if") && !is_keyword_at(p, "else"))
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

            skip_whitespace(p);

            // Consume optional semicolon after if statement
            if (p->input[p->pos] == ';')
            {
                p->pos++;
                skip_whitespace(p);
            }

            has_last_statement = 0; // if statements as statements don't produce values
            saw_statement = 1;
        }
        else
        {
            // Not a let, assignment, block, or if statement, exit the loop
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
        // Apply the compound operation
        long current_value = p->variables[idx].value;
        if (compound_op == '+')
            final_value = current_value + val_result.value;
        else if (compound_op == '-')
            final_value = current_value - val_result.value;
        else if (compound_op == '*')
            final_value = current_value * val_result.value;
        else if (compound_op == '/')
        {
            if (val_result.value == 0)
                return make_error("Division by zero");
            final_value = current_value / val_result.value;
        }
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
            // If value has no suffix, it's incompatible with a typed variable
            else
            {
                return make_error("Cannot assign untyped value to a typed variable");
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

    // Try to parse an identifier
    char var_name[32];
    int name_len = 0;
    if (!isalpha(p->input[p->pos]))
    {
        p->pos = saved_pos;
        return make_error("not_an_assignment");
    }

    name_len = parse_identifier(p, var_name, sizeof(var_name));

    // Check for '=', '+=', '-=', '*=', or '/=' (single equals, not ==)
    skip_whitespace(p);
    int is_assignment = 0;
    if (p->input[p->pos] == '=' && p->input[p->pos + 1] != '=')
    {
        is_assignment = 1;
    }
    else if ((p->input[p->pos] == '+' || p->input[p->pos] == '-' ||
              p->input[p->pos] == '*' || p->input[p->pos] == '/') &&
             p->input[p->pos + 1] == '=')
    {
        is_assignment = 1;
    }

    if (!is_assignment)
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

    *saved_var_count = p->var_count;
    for (int i = 0; i < p->var_count; i++)
    {
        saved_vars[i] = p->variables[i];
    }

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

static void restore_saved_vars(Parser *p, Variable saved_vars[10], int saved_var_count)
{
    p->var_count = saved_var_count;
    for (int i = 0; i < saved_var_count; i++)
    {
        p->variables[i] = saved_vars[i];
    }
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

    // Not an assignment, parse as if-else (which delegates to match then logical_or as needed)
    return parse_if_else(p);
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
    char tracked_suffix[8] = {0}; // Increased to accommodate "Bool"
    char last_suffix[8] = {0};    // Increased to accommodate "Bool"
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

static InterpretResult parse_expression(Parser *p)
{
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
        else if (str[i] == '(' || str[i] == ')' || str[i] == '{' || str[i] == '}')
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
