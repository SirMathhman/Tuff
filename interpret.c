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
        strncpy(suffix_buf, num.suffix, num.suffix_len);
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
    strncpy(p->tracked_suffix, "Bool", sizeof(p->tracked_suffix) - 1);
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
                    strncpy(p->tracked_suffix, p->variables[idx].type, sizeof(p->tracked_suffix) - 1);
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
            strncpy(p->variables[idx].type, type, sizeof(p->variables[idx].type) - 1);
            p->variables[idx].type[sizeof(p->variables[idx].type) - 1] = '\0';
        }
        return idx;
    }

    if (p->var_count >= 10)
        return -1; // Too many variables

    strncpy(p->variables[p->var_count].name, name, name_len);
    p->variables[p->var_count].name[name_len] = '\0';
    p->variables[p->var_count].value = value;
    p->variables[p->var_count].is_mutable = is_mutable;
    if (type && type[0])
    {
        strncpy(p->variables[p->var_count].type, type, sizeof(p->variables[p->var_count].type) - 1);
        p->variables[p->var_count].type[sizeof(p->variables[p->var_count].type) - 1] = '\0';
    }
    else
    {
        p->variables[p->var_count].type[0] = '\0';
    }

    // Track this name in the all_declared_names array for duplicate checking across scopes
    if (p->all_declared_count < 10)
    {
        strncpy(p->all_declared_names[p->all_declared_count], name, name_len);
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

    strncpy(out_name, &p->input[start], len);
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
static InterpretResult parse_assignment_statement_in_block(Parser *p);

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
        strncpy(declared_type, type_name, sizeof(declared_type) - 1);
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
        }
        // Check for assignment statement (identifier followed by '=')
        else if (isalpha(p->input[p->pos]))
        {
            // Look ahead to see if this is an assignment
            int saved_pos = p->pos;
            char temp_name[32];
            int name_len = parse_identifier(p, temp_name, sizeof(temp_name));

            // Check if found identifier is followed by '=' (with possible whitespace)
            int is_assignment = 0;
            int temp_pos = p->pos;
            while (isspace(p->input[temp_pos]))
                temp_pos++;
            if (p->input[temp_pos] == '=')
            {
                is_assignment = 1;
            }

            // Reset position and handle accordingly
            p->pos = saved_pos;

            if (is_assignment)
            {
                InterpretResult assign_result = parse_assignment_statement_in_block(p);
                if (assign_result.has_error)
                    return assign_result;
                skip_whitespace(p);
            }
            else
            {
                // Not an assignment, exit the loop
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
            if (p->input[p->pos] != '}')
            {
                // Parse the expression in the block
                InterpretResult block_expr_result = parse_additive(p);
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
            // Continue the loop to check for more statements
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
        else
        {
            // Not a let, assignment, or block statement, exit the loop
            break;
        }
    }

    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

// Helper: Parse an assignment statement in a block
static InterpretResult parse_assignment_statement_in_block(Parser *p)
{
    // Parse variable name
    char var_name[32];
    int name_len = 0;
    PARSE_VAR_NAME_OR_RETURN(p, var_name, name_len);

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

    // Expect '='
    InterpretResult eq_result = expect_char(p, '=', "Expected '=' in assignment");
    if (eq_result.has_error)
        return eq_result;
    skip_whitespace(p);

    // Parse the value expression
    InterpretResult val_result = parse_additive(p);
    if (val_result.has_error)
        return val_result;

    // If variable has a declared type, check type compatibility
    if (p->variables[idx].type[0] != '\0')
    {
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

    // Update the variable's value
    p->variables[idx].value = val_result.value;

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

        // Parse the inner expression
        InterpretResult result = parse_additive(p);
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
        strncpy(p->tracked_suffix, "Bool", sizeof(p->tracked_suffix) - 1);
        p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
        p->has_tracked_suffix = 1;
    }

    return left;
}

// Helper: Parse binary logical operation (AND or OR)
static InterpretResult parse_logical_binary_op(Parser *p, char op_char, int is_or)
{
    return parse_binary_logical_op_generic(p, op_char, is_or, parse_additive);
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

// Helper: Parse if-else expression
// Syntax: if (condition) then_expr else else_expr
static InterpretResult parse_if_else(Parser *p)
{
    skip_whitespace(p);

    // Check for 'if' keyword
    if (!is_keyword_at(p, "if"))
    {
        // Not an if expression, parse as logical or
        return parse_logical_or(p);
    }

    p->pos += 2; // Skip 'if'

    // Expect opening parenthesis
    InterpretResult open_paren = expect_char(p, '(', "Expected '(' after 'if'");
    if (open_paren.has_error)
        return open_paren;
    skip_whitespace(p);

    // Parse condition expression
    InterpretResult condition = parse_logical_or(p);
    if (condition.has_error)
        return condition;

    // Require that the condition is a boolean value
    if (!p->has_tracked_suffix || strcmp(p->tracked_suffix, "Bool") != 0)
    {
        return make_error("if-else condition must be a boolean value");
    }

    // Expect closing parenthesis
    InterpretResult close_paren = expect_char(p, ')', "Expected ')' after if condition");
    if (close_paren.has_error)
        return close_paren;
    skip_whitespace(p);

    // Parse then expression
    InterpretResult then_expr = parse_if_else(p);
    if (then_expr.has_error)
        return then_expr;

    // Capture the type of the then branch
    char then_type[8] = {0};
    int then_has_type = p->has_tracked_suffix;
    if (p->has_tracked_suffix)
    {
        strncpy(then_type, p->tracked_suffix, sizeof(then_type) - 1);
        then_type[sizeof(then_type) - 1] = '\0';
    }

    skip_whitespace(p);

    // Expect 'else' keyword
    if (!is_keyword_at(p, "else"))
        return make_error("Expected 'else' in if-else expression");

    p->pos += 4; // Skip 'else'
    skip_whitespace(p);

    // Parse else expression
    InterpretResult else_expr = parse_if_else(p);
    if (else_expr.has_error)
        return else_expr;

    // Capture the type of the else branch
    char else_type[8] = {0};
    int else_has_type = p->has_tracked_suffix;
    if (p->has_tracked_suffix)
    {
        strncpy(else_type, p->tracked_suffix, sizeof(else_type) - 1);
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

    // Evaluate: if condition is non-zero (true), return then value, else return else value
    long result = (condition.value != 0) ? then_expr.value : else_expr.value;

    return (InterpretResult){.value = (int)result, .has_error = false, .error_message = NULL};
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

    // Update the Parser struct with the tracked suffix information
    if (has_tracked_suffix)
    {
        strncpy(p->tracked_suffix, tracked_suffix, sizeof(p->tracked_suffix) - 1);
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
    // Check for top-level let statements
    InterpretResult let_statements_result = parse_let_statements_loop(p);
    if (let_statements_result.has_error)
        return let_statements_result;

    // Parse the final expression (can be if-else, logical OR, or other expressions)
    return parse_if_else(p);
}

static int is_expression(const char *str)
{
    int in_number = 0;
    int in_identifier = 0;

    // Skip leading whitespace
    while (isspace(*str))
        str++;

    // Check if it's a let statement
    if (str[0] == 'l' && str[1] == 'e' && str[2] == 't')
    {
        return 1;
    }

    // Check for if expression
    if (strncmp(str, "if", 2) == 0 && (isspace(str[2]) || str[2] == '('))
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
        else if (str[i] == '=' && in_identifier)
        {
            // Assignment statement (variable = value)
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
