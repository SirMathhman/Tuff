#include "interpret.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdio.h>
#include <stdarg.h>
#include <stdint.h>

#define MAX_ARRAY_ELEMENTS 64

typedef struct
{
    const char *suffix;
    int64_t min_value;
    int64_t max_value;
    const char *error_message;
} TypeInfo;

typedef struct
{
    char name[32];
    int32_t value;
    char type[16];          // Store variable's type (e.g., "U8", "U16", "*I32", "[I32;3;3]")
    bool is_mutable;        // 1 if mutable, 0 if immutable
    int32_t pointer_target; // -1 if not a pointer, otherwise index of pointed-to variable
    bool is_array;          // 1 if array, 0 otherwise
    int32_t array_init_count;
    int32_t array_total_count;
    char array_element_type[16];
    int32_t array_values[MAX_ARRAY_ELEMENTS];
    bool is_struct;                     // 1 if struct instance, 0 otherwise
    int32_t struct_def_idx;             // Index in parser's structs array
    int32_t struct_values[10];          // Field values for struct instances
    char struct_string_values[10][256]; // Field string values for string fields
    int32_t struct_string_lengths[10];  // String lengths for each string field
    int32_t slice_start;                // Start index of slice (for pointer-to-array types)
    int32_t slice_end;                  // End index of slice (for pointer-to-array types)
    bool is_string;                     // 1 if string value
    char string_value[256];             // Store string content
    int32_t string_len;                 // Length of string
    int32_t string_max_size;            // Max size for Str[N] types (-1 if unbounded *Str)
    bool is_args_slice;                 // 1 if initialized from __args__ builtin, 0 otherwise
} Variable;

typedef struct
{
    char name[32];
    char param_names[10][32]; // Parameter names
    char param_types[10][32]; // Parameter types
    int32_t param_count;      // Number of parameters
    char return_type[32];     // Return type
    int32_t body_start_pos;   // Position in input where function body starts
    int32_t body_end_pos;     // Position in input where function body ends
    int32_t is_braced_body;   // 1 if body has braces { }, 0 if implicit body
} FunctionInfo;

typedef struct
{
    char name[32];            // Struct name
    char field_names[10][32]; // Field names
    char field_types[10][32]; // Field types
    int32_t field_count;      // Number of fields
} StructInfo;

typedef struct
{
    const char *input;
    int32_t pos;
    InterpretResult last_error;
    char tracked_suffix[16]; // Increased to accommodate "*mut I32"
    int32_t has_tracked_suffix;
    Variable variables[10];
    int32_t var_count;
    char all_declared_names[10][32]; // Track all variable names ever declared
    int32_t all_declared_count;      // Count of all declared names
    int32_t has_temp_array;
    int32_t temp_array_count;
    char temp_array_element_type[16];
    int32_t temp_array_values[MAX_ARRAY_ELEMENTS];
    char declared_functions[10][32];  // Track all declared function names
    int32_t declared_functions_count; // Count of declared functions
    FunctionInfo functions[10];       // Array of function information
    int32_t functions_count;          // Count of stored functions
    int32_t has_temp_struct;
    int32_t temp_struct_def_idx;
    int32_t temp_struct_values[10];
    char temp_struct_string_values[10][256]; // String field values for temp struct
    int32_t temp_struct_string_lengths[10];  // String field lengths for temp struct
    char declared_structs[10][32];           // Track all declared struct names
    int32_t declared_structs_count;          // Count of declared structs
    StructInfo structs[10];                  // Array of struct definitions
    int32_t structs_count;                   // Count of struct definitions
    int32_t temp_slice_start;                // Start index for temporary slice
    int32_t temp_slice_end;                  // End index for temporary slice
    int32_t has_temp_string;                 // 1 if temp string is set
    char temp_string_value[256];             // Store temporary string
    int32_t temp_string_len;                 // Length of temporary string
    int32_t argc;                            // argc value for __args__.length (-1 if not provided)
    const char *const *argv;                 // argv array for __args__[n] (NULL if not provided)
} Parser;

typedef struct
{
    int32_t value;
    const char *suffix;
    int32_t suffix_len;
} NumberValue;

static const TypeInfo type_info[] = {
    {"U8", 0, 255, "Value out of range for U8 (0-255)"},
    {"U16", 0, 65535, "Value out of range for U16 (0-65535)"},
    {"U32", 0, 4294967295LL, "Value out of range for U32 (0-4294967295)"},
    {"U64", 0, 9223372036854775807LL, "Value out of range for U64"},
    {"USize", 0, 9223372036854775807LL, "Value out of range for USize"},
    {"I8", -128, 127, "Value out of range for I8 (-128 to 127)"},
    {"I16", -32768, 32767, "Value out of range for I16 (-32768 to 32767)"},
    {"I32", -2147483648LL, 2147483647LL, "Value out of range for I32"},
    {"I64", -9223372036854775807LL - 1, 9223372036854775807LL, "Value out of range for I64"},
    {"ISize", -9223372036854775807LL - 1, 9223372036854775807LL, "Value out of range for ISize"},
    {NULL, 0, 0, NULL}};

// Helper: Check if a type string is a pointer type
static int32_t is_pointer_type(const char *type)
{
    return type && type[0] == '*' && type[1] != '\0';
}

// Helper: Check if a pointer type is mutable (*mut Type)
static int32_t is_mutable_pointer_type(const char *pointer_type)
{
    if (!pointer_type || pointer_type[0] != '*')
        return 0;
    // Check if it starts with "*mut " (skip '*', then check 'mut ')
    return pointer_type[1] == 'm' && pointer_type[2] == 'u' && pointer_type[3] == 't' && pointer_type[4] == ' ';
}

// Helper: Extract the base type from a pointer type (e.g., "*I32" -> "I32")
static void extract_pointer_base_type(const char *pointer_type, char *out_base_type, int32_t max_len)
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
static InterpretResult parse_identifier_or_error(Parser *p, char *out_name, int32_t max_name_len, const char *error_msg);
static InterpretResult expect_char(Parser *p, char expected, const char *error_msg);
static void skip_whitespace(Parser *p);

// Helper: Check if a type string is a string stack type (e.g., "Str[32]")
static int32_t is_string_type_string(const char *type)
{
    return type && strncmp(type, "Str[", 4) == 0;
}

// Helper: Extract size from string type (e.g., "Str[32]" -> 32)
static int32_t extract_string_type_size(const char *string_type)
{
    if (!is_string_type_string(string_type))
        return -1;

    const char *p = string_type + 4; // Skip "Str["
    int32_t size = 0;
    while (*p && isdigit(*p))
    {
        size = size * 10 + (*p - '0');
        p++;
    }
    if (*p == ']')
        return size;
    return -1; // Invalid format
}

// Helper: Check if a type string is an array type
static int32_t is_array_type_string(const char *type)
{
    return type && type[0] == '[';
}

// Helper: Check if a type string is a pointer-to-array type (e.g., "*[I32]" or "*mut [I32]")
static int32_t is_pointer_to_array_type(const char *type)
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
static void extract_pointer_array_element_type(const char *pointer_array_type, char *out_elem_type, int32_t max_len)
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
    int32_t len = 0;
    while (*p && *p != ']' && len < max_len - 1)
    {
        out_elem_type[len++] = *p;
        p++;
    }
    out_elem_type[len] = '\0';
}

// Helper: Parse non-negative integer from input
static int32_t parse_non_negative_int(Parser *p, int32_t *out_value)
{
    skip_whitespace(p);
    if (!isdigit(p->input[p->pos]))
        return 0;

    int32_t value = 0;
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
    int32_t out_type_size,
    char *out_elem_type,
    int32_t out_elem_type_size,
    int32_t *out_init_count,
    int32_t *out_total_count)
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

    int32_t init_count = 0;
    if (!parse_non_negative_int(p, &init_count))
    {
        return make_error("Expected initialized element count");
    }

    InterpretResult second_sep = expect_char(p, ';', "Expected ';' after initialized element count");
    if (second_sep.has_error)
        return second_sep;

    int32_t total_count = 0;
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

// Helper: Parse string type annotation: Str[Size]
static InterpretResult parse_string_type_annotation(
    Parser *p,
    char *out_type,
    int32_t out_type_size,
    int32_t *out_size)
{
    InterpretResult open_bracket = expect_char(p, '[', "Expected '[' to start string type");
    if (open_bracket.has_error)
        return open_bracket;
    skip_whitespace(p);

    int32_t size = 0;
    if (!parse_non_negative_int(p, &size))
    {
        return make_error("Expected string size");
    }

    if (size <= 0 || size > 65535)
    {
        return make_error("String size must be between 1 and 65535");
    }

    InterpretResult close_bracket = expect_char(p, ']', "Expected ']' after string size");
    if (close_bracket.has_error)
        return close_bracket;

    snprintf(out_type, out_type_size, "Str[%d]", size);
    out_type[out_type_size - 1] = '\0';
    *out_size = size;

    return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
}

static int32_t suffix_length(const char *suffix)
{
    if (!suffix || !suffix[0])
        return 0;
    // Check for 5-char suffixes first (USize, ISize)
    if ((suffix[0] == 'U' || suffix[0] == 'I') &&
        suffix[1] == 'S' && suffix[2] == 'i' && suffix[3] == 'z' && suffix[4] == 'e')
    {
        return 5; // USize or ISize
    }
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

static int32_t contains_suffix(const char *suffix, const char *search_suffix)
{
    int32_t len = suffix_length(search_suffix);
    return strncmp(suffix, search_suffix, len) == 0;
}

// Helper: Check if there's a typed operand ahead in the remaining input
// Scans ahead looking for "+ number_with_suffix" or "- number_with_suffix" patterns
static int32_t has_typed_operand_ahead(const char *input, int32_t pos)
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

static int32_t get_type_info_index(const char *suffix);

static InterpretResult validate_value_by_index(int64_t value, int32_t type_idx)
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

static InterpretResult validate_type(int64_t value, const char *suffix)
{
    int32_t type_idx = get_type_info_index(suffix);
    return validate_value_by_index(value, type_idx);
}

static int32_t get_type_info_index(const char *suffix)
{
    if (!suffix || !suffix[0])
        return -1;

    for (int32_t i = 0; type_info[i].suffix != NULL; i++)
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
    {'U', "U32", {"U64", "USize", NULL}},
    {'U', "U64", {"USize", NULL, NULL}},
    {'U', "USize", {NULL, NULL, NULL}},
    {'I', "I8", {"I16", "I32", "I64"}},
    {'I', "I16", {"I32", "I64", NULL}},
    {'I', "I32", {"I64", "ISize", NULL}},
    {'I', "I64", {"ISize", NULL, NULL}},
    {'I', "ISize", {NULL, NULL, NULL}},
    {0, NULL, {NULL, NULL, NULL}}};

// Helper: Check if source type can be assigned to destination type
// using the unified type hierarchy
static int32_t check_type_hierarchy(char type_char, const char *dest, const char *src)
{
    for (int32_t i = 0; type_hierarchies[i].type_char != 0; i++)
    {
        if (type_hierarchies[i].type_char == type_char && contains_suffix(src, type_hierarchies[i].source_type))
        {
            for (int32_t j = 0; type_hierarchies[i].wider_types[j] != NULL; j++)
            {
                if (contains_suffix(dest, type_hierarchies[i].wider_types[j]))
                    return 1;
            }
            return 0;
        }
    }
    return 0;
}

static int32_t is_type_compatible(const char *dest_type, const char *source_type);

// Helper: Parse array type string "[Type;Init;Total]"
static int32_t parse_array_type_string(const char *type_str, char *out_elem_type, int32_t elem_type_size, int32_t *out_init, int32_t *out_total)
{
    if (!is_array_type_string(type_str))
        return 0;

    const char *p = type_str + 1;
    int32_t i = 0;
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
    int32_t init_count = strtol(p, &endptr, 10);
    if (endptr == p || *endptr != ';')
        return 0;
    p = endptr + 1;

    int32_t total_count = strtol(p, &endptr, 10);
    if (endptr == p || *endptr != ']')
        return 0;

    if (init_count < 0 || total_count < 0)
        return 0;

    *out_init = (int)init_count;
    *out_total = (int)total_count;
    return 1;
}

// Helper: Check array type compatibility
static int32_t is_array_type_compatible(const char *dest_type, const char *source_type)
{
    char dest_elem[16] = {0};
    char src_elem[16] = {0};
    int32_t dest_init = 0;
    int32_t dest_total = 0;
    int32_t src_init = 0;
    int32_t src_total = 0;

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
static int32_t is_type_compatible(const char *dest_type, const char *source_type)
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

    // Check for *Str type (special case for string pointers)
    if (strcmp(dest_type, "*Str") == 0 && strcmp(source_type, "*Str") == 0)
        return 1;

    // Check for stack string types Str[N] - must match exactly for now
    if (is_string_type_string(dest_type) && is_string_type_string(source_type))
        return strcmp(dest_type, source_type) == 0;

    // Allow assigning string literal (*Str) to Str[N] stack string
    if (is_string_type_string(dest_type) && strcmp(source_type, "*Str") == 0)
        return 1;

    int32_t dest_idx = get_type_info_index(dest_type);
    int32_t src_idx = get_type_info_index(source_type);

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

static void extract_suffix(const char *str, int32_t pos, char *suffix_buf)
{
    suffix_buf[0] = '\0';
    if (isalpha(str[pos]))
    {
        int32_t len = suffix_length(&str[pos]);
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
static void save_variable_state(Parser *p, Variable saved_vars[10], int32_t *saved_var_count)
{
    *saved_var_count = p->var_count;
    for (int32_t i = 0; i < p->var_count; i++)
    {
        saved_vars[i] = p->variables[i];
    }
}

// Helper: Restore variable state
static void restore_saved_vars(Parser *p, Variable saved_vars[10], int32_t saved_var_count)
{
    p->var_count = saved_var_count;
    for (int32_t i = 0; i < saved_var_count; i++)
    {
        p->variables[i] = saved_vars[i];
    }
}

// Helper: Build a slice type string from element type and mutability
static void build_slice_type_string(char *out_type, int32_t out_size, const char *elem_type, int32_t is_mut)
{
    if (is_mut)
    {
        snprintf(out_type, out_size, "*mut [%s]", elem_type);
    }
    else
    {
        snprintf(out_type, out_size, "*[%s]", elem_type);
    }
    out_type[out_size - 1] = '\0';
}

// Helper: Set tracked suffix on parser
static void set_tracked_suffix(Parser *p, const char *suffix_buf)
{
    strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), suffix_buf, _TRUNCATE);
    p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
    p->has_tracked_suffix = 1;
}

// Helper: Set parser temp string state and track string type
// Used by string literals, string struct fields, and argv-backed strings.
static void set_temp_string_and_track(Parser *p, const char *string_val, int32_t string_len, const char *type, NumberValue *out_num)
{
    if (!p)
        return;

    if (string_len < 0)
        string_len = 0;
    if (string_len > 255)
        string_len = 255;

    p->has_temp_string = 1;
    p->temp_string_len = string_len;
    if (string_val && string_len > 0)
    {
        strncpy_s(p->temp_string_value, sizeof(p->temp_string_value), string_val, string_len);
    }
    p->temp_string_value[string_len] = '\0';

    set_tracked_suffix(p, type ? type : "*Str");

    if (out_num)
    {
        out_num->value = 0;
        out_num->suffix = p->tracked_suffix;
        out_num->suffix_len = (int32_t)strlen(p->tracked_suffix);
    }
}

// (deduped) set_temp_string_and_track defined above

static NumberValue parse_number_raw(Parser *p)
{
    skip_whitespace(p);

    if (!isdigit(p->input[p->pos]))
    {
        return (NumberValue){.value = 0, .suffix = NULL, .suffix_len = 0};
    }

    int32_t value = 0;
    while (isdigit(p->input[p->pos]))
    {
        value = value * 10 + (p->input[p->pos] - '0');
        p->pos++;
    }

    // Check for type suffix
    const char *suffix_start = &p->input[p->pos];
    int32_t suffix_len = 0;
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
static int32_t is_keyword_at(Parser *p, const char *keyword);
static int32_t find_variable(Parser *p, const char *name, int32_t name_len);
static int32_t find_function(Parser *p, const char *name, int32_t name_len);
static int32_t find_struct(Parser *p, const char *name, int32_t name_len);
static int32_t find_struct_field_index(Parser *p, int32_t struct_idx, const char *field_name, int32_t field_name_len);
static int32_t set_variable_with_type(Parser *p, const char *name, int32_t name_len, int32_t value, const char *type);
static int32_t set_array_variable_with_mutability(Parser *p, const char *name, int32_t name_len, const char *array_type, const char *element_type, int32_t init_count, int32_t total_count, const int32_t *values, int32_t is_mutable);
static void save_variable_state(Parser *p, Variable saved_vars[10], int32_t *saved_var_count);
static void restore_saved_vars(Parser *p, Variable saved_vars[10], int32_t saved_var_count);
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
static int32_t is_binary_operator(char c, const char *operators)
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
static int32_t should_continue_binary_op(Parser *p, const char *operators)
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
    int32_t has_operator;
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
static int32_t find_variable(Parser *p, const char *name, int32_t name_len);
static intptr_t parse_identifier(Parser *p, char *out_name, int32_t max_name_len);

// Helper: Parse property access (.property_name) and return property name length, or 0 if not present
// Modifies parser position if successful
static int32_t parse_property_access(Parser *p, char *out_property_name, int32_t max_property_len)
{
    skip_whitespace(p);
    if (p->input[p->pos] != '.')
        return 0;

    p->pos++; // Skip '.'
    skip_whitespace(p);

    int32_t property_len = parse_identifier(p, out_property_name, max_property_len);
    return property_len;
}

// Helper: Check if property matches expected name
static int32_t is_property_match(const char *property_name, int32_t property_name_len, const char *expected)
{
    int32_t expected_len = (int32_t)strlen(expected);
    return strncmp(property_name, expected, property_name_len) == 0 && property_name_len == expected_len;
}

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

    int32_t count = 0;
    char element_type[16] = {0};
    int32_t has_element_type = 0;

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
// Returns an InterpretResult with the parsed index value stored in out_index
static InterpretResult parse_bracket_index(Parser *p, int32_t *out_index)
{
    InterpretResult bracket_open = expect_char(p, '[', "Expected '[' to start array index");
    if (bracket_open.has_error)
        return bracket_open;
    skip_whitespace(p);

    InterpretResult index_result = parse_additive(p);
    if (index_result.has_error)
        return index_result;

    *out_index = index_result.value;

    skip_whitespace(p);
    InterpretResult bracket_close = expect_char(p, ']', "Expected ']' after array index");
    if (bracket_close.has_error)
        return bracket_close;

    return (InterpretResult){.value = index_result.value, .has_error = false, .error_message = NULL};
}

// Helper: Set tracked suffix for a value and populate output number struct
// Used when returning indexed values or dereferences with explicit types
static void set_tracked_suffix_and_output(Parser *p, const char *type, int32_t value, NumberValue *out_num)
{
    strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), type, _TRUNCATE);
    p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
    p->has_tracked_suffix = 1;

    if (out_num)
    {
        out_num->value = value;
        out_num->suffix = p->tracked_suffix;
        out_num->suffix_len = (int32_t)strlen(p->tracked_suffix);
    }
}

// Helper: Parse array index access (array[idx])
static InterpretResult parse_array_index(Parser *p, int32_t var_idx, NumberValue *out_num)
{
    int32_t index_value = 0;
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

    int32_t value = p->variables[var_idx].array_values[index_value];

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
        int32_t is_mut_ref = 0;
        if (is_keyword_at(p, "mut"))
        {
            is_mut_ref = 1;
            p->pos += 3; // Skip 'mut'
            skip_whitespace(p);
        }

        // Parse the variable name after & or &mut
        char var_name[32];
        int32_t name_len = parse_identifier(p, var_name, sizeof(var_name));
        if (name_len <= 0)
        {
            return make_error("Expected variable name after & operator");
        }

        // Find the variable
        int32_t var_idx = find_variable(p, var_name, name_len);
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
            int32_t start_idx = start_result.value;

            // Expect '..' operator
            InterpretResult range_op = expect_range_operator(p);
            if (range_op.has_error)
                return range_op;

            // Parse end value
            InterpretResult end_result = parse_additive(p);
            if (end_result.has_error)
                return end_result;
            int32_t end_idx = end_result.value;

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
            build_slice_type_string(slice_type, sizeof(slice_type), p->variables[var_idx].array_element_type, is_mut_ref);

            // Set the tracked suffix to the slice type
            set_tracked_suffix_and_output(p, slice_type, var_idx, out_num);

            // Store slice bounds in temporary fields
            p->temp_slice_start = start_idx;
            p->temp_slice_end = end_idx;

            // Return the array variable index as the slice pointer value
            return (InterpretResult){.value = var_idx, .has_error = false, .error_message = NULL};
        }

        // Check if this is an implicit full-array slice: &array (no explicit bounds)
        // When referencing an array without bounds, create an implicit slice over the full array
        if (p->variables[var_idx].is_array)
        {
            // Create implicit full-array slice type: *[ElementType] or *mut [ElementType]
            char slice_type[32];
            build_slice_type_string(slice_type, sizeof(slice_type), p->variables[var_idx].array_element_type, is_mut_ref);

            // Set the tracked suffix to the slice type
            set_tracked_suffix_and_output(p, slice_type, var_idx, out_num);

            // Store implicit slice bounds (full array)
            p->temp_slice_start = 0;
            p->temp_slice_end = p->variables[var_idx].array_total_count;

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

        int32_t char_value = (unsigned char)p->input[p->pos];
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

    // Check for string literal ("test")
    if (p->input[p->pos] == '"')
    {
        p->pos++; // Skip opening double quote

        int32_t string_len = 0;
        while (p->input[p->pos] && p->input[p->pos] != '"' && string_len < 255)
        {
            p->temp_string_value[string_len] = p->input[p->pos];
            string_len++;
            p->pos++;
        }
        p->temp_string_value[string_len] = '\0';

        if (p->input[p->pos] != '"')
        {
            return make_error("Expected closing double quote for string literal");
        }
        p->pos++; // Skip closing double quote

        set_temp_string_and_track(p, p->temp_string_value, string_len, "*Str", out_num);

        return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
    }

    // Check for dereference operator (*pointer)
    // This is handled at a different parsing level since * is used for multiplication
    // We'll detect it based on pointer type tracking

    // Check for variable reference or boolean literal
    if (isalpha(p->input[p->pos]) || p->input[p->pos] == '_')
    {
        int32_t saved_pos = p->pos;
        char var_name[32];
        int32_t name_len = parse_identifier(p, var_name, sizeof(var_name));
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

            // Check for __args__.length special builtin
            if (strncmp(var_name, "__args__", name_len) == 0 && name_len == 8)
            {
                char property_name[32];
                int32_t property_name_len = parse_property_access(p, property_name, sizeof(property_name));
                if (property_name_len > 0 && strncmp(property_name, "length", property_name_len) == 0 && property_name_len == 6)
                {
                    // This is __args__.length - return the actual argc value if provided, otherwise 0
                    // If argc is -1 (not provided), return 0 as placeholder
                    // If argc >= 0, return argc (total argument count including program name)
                    int32_t args_length_value = (p->argc >= 0) ? p->argc : 0;
                    // Don't set a type suffix - let it be untyped so it can assign to any numeric type
                    p->has_tracked_suffix = 0;
                    return (InterpretResult){.value = (int)args_length_value, .has_error = false, .error_message = NULL};
                }
                else if (property_name_len > 0)
                {
                    return make_error("Unknown __args__ property (only 'length' is supported)");
                }
                else if (p->input[p->pos] == '[')
                {
                    // __args__[n] indexing - return string at index n
                    int32_t index_value = 0;
                    InterpretResult bracket_result = parse_bracket_index(p, &index_value);
                    if (bracket_result.has_error)
                        return bracket_result;

                    // Check that index is within bounds
                    if (p->argc > 0 && index_value >= 0 && index_value < p->argc && p->argv != NULL && p->argv[index_value] != NULL)
                    {
                        // We have access to the actual argv string - store it as temp string
                        const char *arg_string = p->argv[index_value];
                        int32_t arg_len = strlen(arg_string);
                        if (arg_len < 256)
                        {
                            // Store in temp string for later assignment
                            set_temp_string_and_track(p, arg_string, arg_len, "*Str", out_num);
                            // Return the string length so .length property works
                            return (InterpretResult){.value = (int)arg_len, .has_error = false, .error_message = NULL};
                        }
                    }

                    // If we don't have argv data, mark as *Str type but we can't get actual string
                    // This will be handled specially at compile time
                    set_tracked_suffix(p, "*Str");

                    // Return a pseudo-value representing the string at this index
                    // The compile() function will handle __args__[n] specially if needed
                    return (InterpretResult){.value = (int)index_value, .has_error = false, .error_message = NULL};
                }
                else
                {
                    // __args__ without property access - treat as a slice reference with type *[*Str]
                    // This allows assignment to slice variables: let myArgs : *[*Str] = __args__
                    set_tracked_suffix(p, "*[*Str]");
                    // Return argc as the "value" - this will be used during variable initialization
                    int32_t args_value = (p->argc >= 0) ? p->argc : 0;
                    return (InterpretResult){.value = (int)args_value, .has_error = false, .error_message = NULL};
                }
            }

            // Check for variable reference
            int32_t idx = find_variable(p, var_name, name_len);
            if (idx >= 0)
            {
                skip_whitespace(p);
                if (p->input[p->pos] == '[')
                {
                    // Check if this is an array, slice, or string
                    int32_t is_indexable = p->variables[idx].is_array ||
                                           is_pointer_to_array_type(p->variables[idx].type) ||
                                           p->variables[idx].is_string;

                    if (!is_indexable)
                    {
                        return make_error("Cannot index non-array variable");
                    }

                    // If it's a string, handle string indexing
                    if (p->variables[idx].is_string)
                    {
                        int32_t index_value = 0;
                        InterpretResult bracket_result = parse_bracket_index(p, &index_value);
                        if (bracket_result.has_error)
                            return bracket_result;

                        if (index_value < 0 || index_value >= p->variables[idx].string_len)
                        {
                            return make_error("String index out of bounds");
                        }

                        int32_t char_code = (unsigned char)p->variables[idx].string_value[index_value];

                        // Set tracked suffix to I32 (char codes are numeric)
                        strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), "I32", _TRUNCATE);
                        p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
                        p->has_tracked_suffix = 1;

                        if (out_num)
                        {
                            out_num->value = char_code;
                            out_num->suffix = p->tracked_suffix;
                            out_num->suffix_len = 3;
                        }

                        return (InterpretResult){.value = char_code, .has_error = false, .error_message = NULL};
                    }

                    // If it's a slice, we need to handle it differently
                    if (is_pointer_to_array_type(p->variables[idx].type))
                    {
                        // For slices, extract element type from pointer-to-array type
                        char elem_type[16];
                        extract_pointer_array_element_type(p->variables[idx].type, elem_type, sizeof(elem_type));

                        // Parse the index
                        int32_t index_value = 0;
                        InterpretResult bracket_result = parse_bracket_index(p, &index_value);
                        if (bracket_result.has_error)
                            return bracket_result;

                        // Get the array variable that the slice points to
                        int32_t array_var_idx = p->variables[idx].pointer_target;
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
                        int32_t value = p->variables[array_var_idx].array_values[index_value];

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
                    // Allow array to be referenced as a value (e.g., for function arguments)
                    // Set tracked suffix to array type with CURRENT initialization count
                    char array_type_with_init[64];
                    snprintf(array_type_with_init, sizeof(array_type_with_init), "[%s;%d;%d]",
                             p->variables[idx].array_element_type,
                             p->variables[idx].array_init_count,
                             p->variables[idx].array_total_count);
                    array_type_with_init[sizeof(array_type_with_init) - 1] = '\0';

                    strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), array_type_with_init, _TRUNCATE);
                    p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
                    p->has_tracked_suffix = 1;

                    if (out_num)
                    {
                        out_num->value = idx; // Return array variable index
                        out_num->suffix = p->tracked_suffix;
                        out_num->suffix_len = strlen(p->tracked_suffix);
                    }

                    // Return array variable index as the value
                    return (InterpretResult){.value = idx, .has_error = false, .error_message = NULL};
                }

                // Handle slice.length property access
                if (is_pointer_to_array_type(p->variables[idx].type))
                {
                    char property_name[32];
                    int32_t property_name_len = parse_property_access(p, property_name, sizeof(property_name));
                    if (property_name_len > 0)
                    {
                        // Check for .length property
                        if (is_property_match(property_name, property_name_len, "length"))
                        {
                            int32_t length_value = 0;

                            // Special handling for __args__ slice variables
                            if (p->variables[idx].is_args_slice)
                            {
                                // Return argc for __args__ slices
                                length_value = p->variables[idx].value;
                            }
                            else
                            {
                                // Return the slice length (end - start)
                                length_value = p->variables[idx].slice_end - p->variables[idx].slice_start;
                            }

                            set_tracked_suffix_and_output(p, "I32", length_value, out_num);
                            return (InterpretResult){.value = (int)length_value, .has_error = false, .error_message = NULL};
                        }
                        else if (is_property_match(property_name, property_name_len, "init"))
                        {
                            // Get the underlying array
                            int32_t array_var_idx = p->variables[idx].pointer_target;
                            if (array_var_idx < 0 || array_var_idx >= p->var_count || !p->variables[array_var_idx].is_array)
                            {
                                return make_error("Invalid slice pointer");
                            }

                            // Calculate initialized count within slice bounds
                            int32_t init_count = 0;
                            if (p->variables[idx].slice_start < p->variables[array_var_idx].array_init_count)
                            {
                                int32_t max_init = p->variables[array_var_idx].array_init_count;
                                int32_t slice_end = p->variables[idx].slice_end;
                                int32_t effective_end = (slice_end < max_init) ? slice_end : max_init;
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

                // Handle string.length property access for both *Str and Str[N] types
                if (p->variables[idx].is_string || strcmp(p->variables[idx].type, "*Str") == 0)
                {
                    char property_name[32];
                    int32_t property_name_len = parse_property_access(p, property_name, sizeof(property_name));
                    if (property_name_len > 0)
                    {
                        if (is_property_match(property_name, property_name_len, "length"))
                        {
                            int32_t length_value = p->variables[idx].string_len;

                            // Set tracked suffix to I32 (length is always numeric)
                            set_tracked_suffix_and_output(p, "I32", length_value, out_num);

                            return (InterpretResult){.value = (int)length_value, .has_error = false, .error_message = NULL};
                        }
                        else
                        {
                            return make_error("Unknown string property (only 'length' is supported)");
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
                    int32_t field_name_len = parse_identifier(p, field_name, sizeof(field_name));
                    if (field_name_len <= 0)
                    {
                        return make_error("Expected field name after '.'");
                    }

                    int32_t struct_idx = p->variables[idx].struct_def_idx;
                    if (struct_idx < 0 || struct_idx >= p->structs_count)
                    {
                        return make_error("Invalid struct type");
                    }

                    int32_t field_idx = find_struct_field_index(p, struct_idx, field_name, field_name_len);
                    if (field_idx < 0)
                    {
                        return make_error("Unknown struct field");
                    }

                    int32_t field_value = p->variables[idx].struct_values[field_idx];
                    const char *field_type = p->structs[struct_idx].field_types[field_idx];

                    // Handle string fields (Str[N] or *Str)
                    if (is_string_type_string(field_type) || strcmp(field_type, "*Str") == 0)
                    {
                        skip_whitespace(p);

                        int32_t string_len = p->variables[idx].struct_string_lengths[field_idx];
                        const char *string_val = p->variables[idx].struct_string_values[field_idx];

                        // Support indexing into string field: d.msg[0]
                        if (p->input[p->pos] == '[')
                        {
                            int32_t index_value = 0;
                            InterpretResult bracket_result = parse_bracket_index(p, &index_value);
                            if (bracket_result.has_error)
                                return bracket_result;

                            if (index_value < 0 || index_value >= string_len)
                            {
                                return make_error("String index out of bounds");
                            }

                            int32_t char_code = (unsigned char)string_val[index_value];
                            set_tracked_suffix_and_output(p, "I32", char_code, out_num);
                            return (InterpretResult){.value = char_code, .has_error = false, .error_message = NULL};
                        }

                        // Support .length property on string fields
                        if (p->input[p->pos] == '.')
                        {
                            char property_name[32];
                            int32_t property_name_len = parse_property_access(p, property_name, sizeof(property_name));
                            if (property_name_len > 0)
                            {
                                if (strncmp(property_name, "length", property_name_len) == 0 && property_name_len == 6)
                                {
                                    set_tracked_suffix_and_output(p, "I32", string_len, out_num);
                                    return (InterpretResult){.value = string_len, .has_error = false, .error_message = NULL};
                                }
                                return make_error("Unknown string property (only 'length' is supported)");
                            }
                        }

                        // Return string value for further use (e.g., assignment)
                        set_temp_string_and_track(p, string_val, string_len, field_type, out_num);

                        return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
                    }

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
                int32_t struct_idx = find_struct(p, var_name, name_len);
                if (struct_idx >= 0)
                {
                    p->pos++; // Skip '{'
                    skip_whitespace(p);

                    int32_t field_values[10] = {0};
                    int32_t field_set[10] = {0};
                    char field_string_values[10][256] = {0};
                    int32_t field_string_lengths[10] = {0};
                    int32_t field_count = p->structs[struct_idx].field_count;

                    if (p->input[p->pos] != '}' || field_count > 0)
                    {
                        while (p->input[p->pos] && p->input[p->pos] != '}')
                        {
                            char field_name[32];
                            int32_t field_name_len = parse_identifier(p, field_name, sizeof(field_name));
                            if (field_name_len <= 0)
                            {
                                return make_error("Expected field name in struct initializer");
                            }

                            int32_t field_idx = find_struct_field_index(p, struct_idx, field_name, field_name_len);
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

                            // Handle string literals specially - they can be assigned to *Str or Str[N]
                            if (p->has_temp_string)
                            {
                                if (strcmp(field_type, "*Str") != 0 && !is_string_type_string(field_type))
                                {
                                    return make_error("String literal cannot be assigned to non-string field");
                                }

                                // Enforce Str[N] size constraints
                                if (is_string_type_string(field_type))
                                {
                                    int32_t max_size = extract_string_type_size(field_type);
                                    if (max_size < 0)
                                        return make_error("Invalid Str[N] type format");
                                    if (p->temp_string_len > max_size)
                                        return make_error("String literal too long for declared Str[N] size");
                                }

                                strncpy_s(field_string_values[field_idx], sizeof(field_string_values[field_idx]),
                                          p->temp_string_value, p->temp_string_len);
                                field_string_values[field_idx][p->temp_string_len] = '\0';
                                field_string_lengths[field_idx] = p->temp_string_len;
                                field_values[field_idx] = 0;

                                p->has_temp_string = 0;
                            }
                            else if (p->has_tracked_suffix && p->tracked_suffix[0] != '\0')
                            {
                                if (!is_type_compatible(field_type, p->tracked_suffix))
                                {
                                    return make_error("Struct field type mismatch");
                                }
                                field_values[field_idx] = value_result.value;
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
                                field_values[field_idx] = value_result.value;
                            }

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

                    for (int32_t i = 0; i < field_count; i++)
                    {
                        if (!field_set[i])
                        {
                            return make_error("Missing field initializer");
                        }
                    }

                    p->has_temp_struct = 1;
                    p->temp_struct_def_idx = struct_idx;
                    for (int32_t i = 0; i < field_count; i++)
                    {
                        p->temp_struct_values[i] = field_values[i];
                        strncpy_s(p->temp_struct_string_values[i], sizeof(p->temp_struct_string_values[i]),
                                  field_string_values[i], _TRUNCATE);
                        p->temp_struct_string_values[i][sizeof(p->temp_struct_string_values[i]) - 1] = '\0';
                        p->temp_struct_string_lengths[i] = field_string_lengths[i];
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
                int32_t func_idx = find_function(p, var_name, name_len);
                if (func_idx >= 0)
                {
                    // This is a function call
                    p->pos++; // Skip '('
                    skip_whitespace(p);

                    // Parse arguments
                    InterpretResult args[10];
                    char arg_types[10][32]; // Store argument types
                    int32_t arg_count = 0;

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
                    for (int32_t i = 0; i < arg_count; i++)
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
                    int32_t saved_var_count;
                    save_variable_state(p, saved_vars, &saved_var_count);

                    // Bind parameters to arguments
                    for (int32_t i = 0; i < arg_count; i++)
                    {
                        // For array arguments, need to copy the entire array variable metadata
                        // not just the value, so use special handling
                        if (is_array_type_string(p->functions[func_idx].param_types[i]))
                        {
                            // Array parameter - need to create a parameter variable with the array data
                            // args[i].value contains the source array variable index
                            int32_t src_array_idx = args[i].value;
                            if (src_array_idx >= 0 && src_array_idx < p->var_count && p->variables[src_array_idx].is_array)
                            {
                                // Copy the array variable with its current init count
                                set_array_variable_with_mutability(
                                    p,
                                    p->functions[func_idx].param_names[i],
                                    strlen(p->functions[func_idx].param_names[i]),
                                    p->variables[src_array_idx].type, // Use actual source type
                                    p->variables[src_array_idx].array_element_type,
                                    p->variables[src_array_idx].array_init_count, // Preserve current init count
                                    p->variables[src_array_idx].array_total_count,
                                    p->variables[src_array_idx].array_values, // Copy values
                                    0);                                       // Parameters are immutable
                            }
                            else
                            {
                                // Fallback - shouldn't happen if type checking passed
                                set_variable_with_type(p, p->functions[func_idx].param_names[i],
                                                       strlen(p->functions[func_idx].param_names[i]),
                                                       args[i].value,
                                                       p->functions[func_idx].param_types[i]);
                            }
                        }
                        else
                        {
                            // Non-array parameter
                            set_variable_with_type(p, p->functions[func_idx].param_names[i],
                                                   strlen(p->functions[func_idx].param_names[i]),
                                                   args[i].value,
                                                   p->functions[func_idx].param_types[i]);
                        }
                    }

                    // Save position and jump to function body
                    int32_t saved_pos = p->pos;
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
static int32_t find_variable(Parser *p, const char *name, int32_t name_len)
{
    for (int32_t i = 0; i < p->var_count; i++)
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

    int32_t brace_depth = 1;
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
static int32_t has_function_been_declared(Parser *p, const char *name, int32_t name_len)
{
    for (int32_t i = 0; i < p->declared_functions_count; i++)
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
static int32_t find_function(Parser *p, const char *name, int32_t name_len)
{
    for (int32_t i = 0; i < p->functions_count; i++)
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
static int32_t find_struct(Parser *p, const char *name, int32_t name_len)
{
    for (int32_t i = 0; i < p->structs_count; i++)
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
static int32_t find_struct_field_index(Parser *p, int32_t struct_idx, const char *field_name, int32_t field_name_len)
{
    if (struct_idx < 0 || struct_idx >= p->structs_count)
        return -1;

    for (int32_t i = 0; i < p->structs[struct_idx].field_count; i++)
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
static void register_declared_function(Parser *p, const char *name, int32_t name_len)
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
static int32_t has_struct_been_declared(Parser *p, const char *name, int32_t name_len)
{
    for (int32_t i = 0; i < p->declared_structs_count; i++)
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
static void register_declared_struct(Parser *p, const char *name, int32_t name_len)
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
    int32_t name_len = parse_identifier(p, func_name, sizeof(func_name));
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
    int32_t param_count = 0;

    while (p->input[p->pos] != ')')
    {
        skip_whitespace(p);

        // Check if we're at the closing parenthesis (no parameters case)
        if (p->input[p->pos] == ')')
            break;

        // Parse parameter name
        char param_name[32];
        int32_t param_name_len = parse_identifier(p, param_name, sizeof(param_name));
        if (param_name_len <= 0)
            return make_error("Expected parameter name");

        // Check if parameter name is already declared
        for (int32_t i = 0; i < param_count; i++)
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

        // Parse parameter type (could be array, pointer, or identifier)
        char param_type[64]; // Increased to support array types

        if (p->input[p->pos] == '[')
        {
            // Array type: [Type; Init; Total]
            char array_elem_type[16];
            int32_t array_init_count = 0;
            int32_t array_total_count = 0;

            InterpretResult array_type_result = parse_array_type_annotation(
                p,
                param_type,
                sizeof(param_type),
                array_elem_type,
                sizeof(array_elem_type),
                &array_init_count,
                &array_total_count);
            if (array_type_result.has_error)
                return array_type_result;
        }
        else if (p->input[p->pos] == '*')
        {
            // Pointer type: *Type or *mut Type
            int32_t type_start = p->pos;
            p->pos++; // Skip '*'
            skip_whitespace(p);

            // Check for 'mut' keyword
            if (is_keyword_at(p, "mut"))
            {
                p->pos += 3; // Skip 'mut'
                skip_whitespace(p);
            }

            // Parse the base type
            char base_type[32];
            int32_t base_type_len = parse_identifier(p, base_type, sizeof(base_type));
            if (base_type_len <= 0)
                return make_error("Expected type after * operator");

            // Reconstruct the pointer type string
            snprintf(param_type, sizeof(param_type), "%.*s", (int)(p->pos - type_start), &p->input[type_start]);
            param_type[sizeof(param_type) - 1] = '\0';
        }
        else
        {
            // Regular identifier type
            int32_t param_type_len = parse_identifier(p, param_type, sizeof(param_type));
            if (param_type_len <= 0)
                return make_error("Expected parameter type");
        }

        // Store parameter type
        strncpy_s(param_types[param_count], sizeof(param_types[param_count]), param_type, _TRUNCATE);
        param_types[param_count][sizeof(param_types[param_count]) - 1] = '\0';
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
        int32_t type_len = parse_identifier(p, return_type, sizeof(return_type));
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

    int32_t body_start_pos = p->pos;
    int32_t body_end_pos = p->pos;
    int32_t is_braced_body = 0;

    if (p->input[p->pos] == '{')
    {
        // Braced body: { expression }
        is_braced_body = 1;
        p->pos++; // Skip '{'
        skip_whitespace(p);

        // Count braces to find matching close
        int32_t brace_count = 1;
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

    for (int32_t i = 0; i < param_count; i++)
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
static int32_t has_variable_been_declared(Parser *p, const char *name, int32_t name_len)
{
    for (int32_t i = 0; i < p->all_declared_count; i++)
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
static InterpretResult parse_identifier_or_error(Parser *p, char *out_name, int32_t max_name_len, const char *error_msg)
{
    int32_t len = parse_identifier(p, out_name, max_name_len);
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
static InterpretResult apply_compound_operator(char compound_op, int32_t current_value, int32_t new_value, int32_t *out_final_value)
{
    int32_t final_value = new_value;

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
static InterpretResult parse_assignment_rhs(Parser *p, char compound_op, int32_t current_value)
{
    // Parse the value expression
    InterpretResult val_result = parse_additive(p);
    if (val_result.has_error)
        return val_result;

    // Calculate the final value
    int32_t final_value = val_result.value;
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
static void register_declared_name(Parser *p, const char *name, int32_t name_len)
{
    if (p->all_declared_count < 10)
    {
        strncpy_s(p->all_declared_names[p->all_declared_count], sizeof(p->all_declared_names[p->all_declared_count]), name, name_len);
        p->all_declared_names[p->all_declared_count][name_len] = '\0';
        p->all_declared_count++;
    }
}

// Helper: Initialize a variable entry with name, value, and type information
static void init_variable_entry(Parser *p, const char *name, int32_t name_len, int32_t value, int32_t pointer_target, int32_t is_mutable, const char *type)
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
    for (int32_t i = 0; i < MAX_ARRAY_ELEMENTS; i++)
    {
        p->variables[p->var_count].array_values[i] = 0;
    }
    p->variables[p->var_count].is_struct = 0;
    p->variables[p->var_count].struct_def_idx = -1;
    for (int32_t i = 0; i < 10; i++)
    {
        p->variables[p->var_count].struct_values[i] = 0;
        p->variables[p->var_count].struct_string_values[i][0] = '\0';
        p->variables[p->var_count].struct_string_lengths[i] = 0;
    }
    p->variables[p->var_count].slice_start = 0;
    p->variables[p->var_count].slice_end = 0;
    p->variables[p->var_count].is_string = 0;
    p->variables[p->var_count].string_value[0] = '\0';
    p->variables[p->var_count].string_len = 0;
    p->variables[p->var_count].string_max_size = -1;
    p->variables[p->var_count].is_args_slice = 0;
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
    for (int32_t i = 0; i < 10; i++)
    {
        var->struct_values[i] = 0;
    }
}

// Helper: Set or add a variable with optional type information
// Helper: Set or add a variable with optional type and mutability information
static int32_t set_variable_with_mutability(Parser *p, const char *name, int32_t name_len, int32_t value, const char *type, int32_t is_mutable)
{
    int32_t idx = find_variable(p, name, name_len);
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
static int32_t set_pointer_variable_with_mutability(Parser *p, const char *name, int32_t name_len, int32_t target_idx, const char *pointer_type, int32_t is_mutable)
{
    // target_idx is the index of the variable being pointed to
    int32_t idx = find_variable(p, name, name_len);
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
static int32_t set_array_variable_with_mutability(
    Parser *p,
    const char *name,
    int32_t name_len,
    const char *array_type,
    const char *element_type,
    int32_t init_count,
    int32_t total_count,
    const int32_t *values,
    int32_t is_mutable)
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
    for (int32_t i = 0; i < total_count && i < MAX_ARRAY_ELEMENTS; i++)
    {
        p->variables[p->var_count].array_values[i] = (i < init_count && values) ? values[i] : 0;
    }

    return p->var_count++;
}

// Helper: Set a string variable with mutability
static int32_t set_variable_string_with_mutability(
    Parser *p,
    const char *name,
    int32_t name_len,
    const char *string_value,
    int32_t string_len,
    const char *type_string,
    int32_t is_mutable)
{
    if (p->var_count >= 10)
        return -1;

    // Default to *Str if type_string not provided
    const char *type = type_string ? type_string : "*Str";
    int32_t max_size = -1;
    if (is_string_type_string(type))
    {
        max_size = extract_string_type_size(type);
        if (max_size < 0)
            return -1; // Invalid Str[N] format
        if (string_len > max_size)
            return -1; // String too long for declared size
    }

    init_variable_entry(p, name, name_len, 0, -1, is_mutable, type);
    p->variables[p->var_count].is_string = 1;
    strncpy_s(p->variables[p->var_count].string_value,
              sizeof(p->variables[p->var_count].string_value),
              string_value,
              string_len);
    p->variables[p->var_count].string_value[string_len] = '\0';
    p->variables[p->var_count].string_len = string_len;
    p->variables[p->var_count].string_max_size = max_size;

    return p->var_count++;
}

// Helper: Set a struct variable with mutability
static int32_t set_struct_variable_with_mutability(
    Parser *p,
    const char *name,
    int32_t name_len,
    int32_t struct_def_idx,
    const int32_t *values,
    const char string_values[10][256],
    const int32_t *string_lengths,
    const char *struct_type,
    int32_t is_mutable)
{
    if (p->var_count >= 10)
        return -1; // Too many variables

    init_variable_entry(p, name, name_len, 0, -1, is_mutable, struct_type);
    p->variables[p->var_count].is_struct = 1;
    p->variables[p->var_count].struct_def_idx = struct_def_idx;

    int32_t field_count = p->structs[struct_def_idx].field_count;
    for (int32_t i = 0; i < field_count && i < 10; i++)
    {
        p->variables[p->var_count].struct_values[i] = values ? values[i] : 0;
        if (string_values)
        {
            strncpy_s(p->variables[p->var_count].struct_string_values[i],
                      sizeof(p->variables[p->var_count].struct_string_values[i]),
                      string_values[i], _TRUNCATE);
            p->variables[p->var_count].struct_string_values[i][sizeof(p->variables[p->var_count].struct_string_values[i]) - 1] = '\0';
        }
        else
        {
            p->variables[p->var_count].struct_string_values[i][0] = '\0';
        }
        p->variables[p->var_count].struct_string_lengths[i] = string_lengths ? string_lengths[i] : 0;
    }

    return p->var_count++;
}

// Helper: Set or add a variable with type information (immutable by default)
static int32_t set_variable_with_type(Parser *p, const char *name, int32_t name_len, int32_t value, const char *type)
{
    return set_variable_with_mutability(p, name, name_len, value, type, 0);
}

// Helper: Set or add a variable without type information (immutable by default)
static int32_t set_variable(Parser *p, const char *name, int32_t name_len, int32_t value)
{
    return set_variable_with_type(p, name, name_len, value, NULL);
}

// Helper: Parse an identifier (variable name)
static intptr_t parse_identifier(Parser *p, char *out_name, int32_t max_name_len)
{
    skip_whitespace(p);

    if (!isalpha(p->input[p->pos]) && p->input[p->pos] != '_')
        return 0;

    int32_t start = p->pos;
    while (isalnum(p->input[p->pos]) || p->input[p->pos] == '_')
    {
        p->pos++;
    }

    int32_t len = p->pos - start;
    if (len >= max_name_len)
        return -1;

    strncpy_s(out_name, max_name_len, &p->input[start], len);
    out_name[len] = '\0';
    return len;
}

// Helper: Parse variable name and return length (or error)
// Helper: Check if a keyword matches at the current position
static int32_t is_keyword_at(Parser *p, const char *keyword)
{
    int32_t i = 0;
    while (keyword[i])
    {
        if (p->input[p->pos + i] != keyword[i])
            return 0;
        i++;
    }
    return 1;
}

// Helper: Parse the 'mut' keyword if present and return mutability flag
static int32_t parse_mut_keyword(Parser *p)
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

static InterpretResult parse_and_validate_var_name(Parser *p, char *out_name, int32_t max_name_len)
{
    InterpretResult name_result = parse_identifier_or_error(p, out_name, max_name_len, "Expected variable name");
    if (name_result.has_error)
        return name_result;
    int32_t name_len = name_result.value;
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
static int32_t has_assignment_operator(Parser *p);

// Helper: Parse body to skip past it, restoring variable state
// Returns the position where the body ends
static int32_t parse_and_skip_body_restoring_state(Parser *p, int32_t body_start_pos)
{
    Variable saved_vars[10];
    int32_t saved_var_count;
    save_variable_state(p, saved_vars, &saved_var_count);

    p->pos = body_start_pos;
    InterpretResult body_result = parse_assignment_or_if_else(p);
    if (body_result.has_error)
    {
        // Note: caller must handle error since we can't return it from this helper
        return -1;
    }
    int32_t body_end_pos = p->pos;

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
    int32_t body_start_pos;
    int32_t body_end_pos;
} LoopState;

static LoopState init_loop_state(Parser *p)
{
    int32_t body_start_pos = p->pos;
    int32_t body_end_pos = body_start_pos;
    return (LoopState){.body_start_pos = body_start_pos, .body_end_pos = body_end_pos};
}

// Helper: Parse a let statement in a block
static InterpretResult parse_let_statement_in_block(Parser *p)
{
    p->pos += 3; // Skip 'let'
    skip_whitespace(p);

    // Check for 'mut' keyword
    int32_t is_mutable = parse_mut_keyword(p);

    // Parse variable name
    char var_name[32];
    int32_t name_len = 0;
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
    int32_t is_array_declared = 0;
    char declared_array_elem_type[16] = {0};
    int32_t declared_array_init_count = 0;
    int32_t declared_array_total_count = 0;
    int32_t declared_struct_idx = -1;

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
        else if (is_keyword_at(p, "Str"))
        {
            // Check for Str[N] type annotation
            p->pos += 3; // Skip 'Str'
            skip_whitespace(p);
            if (p->input[p->pos] == '[')
            {
                int32_t declared_string_size = 0;
                InterpretResult string_type_result = parse_string_type_annotation(
                    p,
                    declared_type,
                    sizeof(declared_type),
                    &declared_string_size);
                if (string_type_result.has_error)
                    return string_type_result;
                is_array_declared = -1; // Mark as string type, not regular array
            }
            else
            {
                return make_error("Expected '[' after Str");
            }
        }
        else
        {
            // Check for pointer type (*) or mutable pointer type (*mut)
            int32_t is_pointer = 0;
            int32_t is_mut_pointer = 0;
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
                // Element type can be a simple type like I32 or a pointer type like *Str
                // Parse simplified array type: [Type] (without size counts)
                p->pos++; // Skip '['
                skip_whitespace(p);

                // Check if element type is a pointer type (*Type) or simple type
                if (p->input[p->pos] == '*')
                {
                    // Element type is a pointer (e.g., *Str for slice of string pointers)
                    p->pos++; // Skip '*'
                    skip_whitespace(p);

                    InterpretResult elem_type_result = parse_identifier_or_error(p, type_name, sizeof(type_name), "Expected element type after *");
                    if (elem_type_result.has_error)
                        return elem_type_result;

                    // Prepend * to make it a pointer type
                    char full_elem_type[64];
                    snprintf(full_elem_type, sizeof(full_elem_type), "*%s", type_name);
                    strncpy_s(type_name, sizeof(type_name), full_elem_type, _TRUNCATE);
                    type_name[sizeof(type_name) - 1] = '\0';
                }
                else
                {
                    // Element type is a simple identifier
                    InterpretResult elem_type_result = parse_identifier_or_error(p, type_name, sizeof(type_name), "Expected array element type");
                    if (elem_type_result.has_error)
                        return elem_type_result;
                }

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

        // Expect '=' (unless it's an array with 0 initial elements)
        skip_whitespace(p);
        if (p->input[p->pos] == '=')
        {
            p->pos++; // Skip '='
            skip_whitespace(p);
        }
        else if (is_array_declared && declared_array_init_count == 0)
        {
            // Array with 0 initial elements doesn't require an initializer
            // Create an empty array that can be populated by element assignment
            set_array_variable_with_mutability(
                p,
                var_name,
                name_len,
                declared_type,
                declared_array_elem_type,
                0, // init_count = 0
                declared_array_total_count,
                NULL, // no initial values
                is_mutable);

            return finalize_statement(p, "Expected ';' after variable declaration");
        }
        else
        {
            return make_error("Expected '=' in variable declaration");
        }
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
        // Infer array type from the literal (implicitly create array type)
        // Use element type from literal and set both init_count and total_count to literal size
        is_array_declared = 1;
        strncpy_s(declared_array_elem_type, sizeof(declared_array_elem_type),
                  p->temp_array_element_type, _TRUNCATE);
        declared_array_elem_type[sizeof(declared_array_elem_type) - 1] = '\0';
        declared_array_init_count = p->temp_array_count;
        declared_array_total_count = p->temp_array_count;

        // Build the inferred array type string
        snprintf(declared_type, sizeof(declared_type), "[%s;%d;%d]",
                 declared_array_elem_type, declared_array_init_count, declared_array_total_count);
        declared_type[sizeof(declared_type) - 1] = '\0';
    }

    if (p->has_temp_struct && declared_type[0] != '\0' && declared_struct_idx < 0)
    {
        return make_error("Struct literal must be assigned to a struct variable");
    }

    if (p->has_temp_string && strcmp(declared_type, "*Str") != 0 && !is_string_type_string(declared_type))
    {
        return make_error("String literal must be assigned to a string pointer variable");
    }

    // Determine the actual type to use for the variable
    char actual_type[16] = {0}; // Expanded to 16 to accommodate pointer types like "*I32"

    if (declared_type[0] != '\0')
    {
        // Explicit type declared: validate that the value fits in that type
        strncpy_s(actual_type, sizeof(actual_type), declared_type, _TRUNCATE);
        actual_type[sizeof(actual_type) - 1] = '\0';

        if (is_array_declared == 1)
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

            for (int32_t i = 0; i < p->temp_array_count; i++)
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
        else if (is_array_declared == -1)
        {
            // String type Str[N]
            if (!p->has_temp_string)
            {
                return make_error("String literal required for Str[N] variable");
            }

            int32_t max_size = extract_string_type_size(declared_type);
            if (max_size < 0)
            {
                return make_error("Invalid Str[N] type format");
            }

            if (p->temp_string_len > max_size)
            {
                return make_error("String literal too long for declared Str[N] size");
            }

            set_variable_string_with_mutability(
                p,
                var_name,
                name_len,
                p->temp_string_value,
                p->temp_string_len,
                declared_type,
                is_mutable);

            p->has_temp_string = 0;
            return finalize_statement(p, "Expected ';' after variable declaration");
        }

        // Check if declared type is string pointer type
        if (strcmp(declared_type, "*Str") == 0)
        {
            if (p->has_temp_string)
            {
                // String literal case
                set_variable_string_with_mutability(
                    p,
                    var_name,
                    name_len,
                    p->temp_string_value,
                    p->temp_string_len,
                    "*Str",
                    is_mutable);

                p->has_temp_string = 0;
                return finalize_statement(p, "Expected ';' after variable declaration");
            }
            else if (p->has_tracked_suffix && strcmp(p->tracked_suffix, "*Str") == 0)
            {
                // Runtime string value case (e.g., from __args__[n])
                // Create a string pointer variable that points to a runtime string
                // We store the value (which represents the string at runtime)
                set_variable_string_with_mutability(
                    p,
                    var_name,
                    name_len,
                    "", // Empty string for now, as the actual string is from runtime
                    0,  // Length 0 for now
                    "*Str",
                    is_mutable);

                // Now find the variable we just created and mark it as a runtime string reference
                int32_t var_idx = find_variable(p, var_name, name_len);
                if (var_idx >= 0)
                {
                    // Store the pointer target if this is a pointer to another string
                    // For __args__, we don't have a direct variable to point32_t to,
                    // so we keep it as a special case handled at runtime
                    p->variables[var_idx].value = val_result.value;
                }

                return finalize_statement(p, "Expected ';' after variable declaration");
            }
            else
            {
                return make_error("String literal required for string pointer variable");
            }
        }

        // Check if declared type is a struct type
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
                p->temp_struct_string_values,
                p->temp_struct_string_lengths,
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

            // Special handling for __args__ assignment to *[*Str] variables
            if (strcmp(declared_type, "*[*Str]") == 0 && strcmp(p->tracked_suffix, "*[*Str]") == 0)
            {
                // This is assignment from __args__ to a slice variable
                // Create the variable and mark it as from __args__
                int32_t var_idx = set_pointer_variable_with_mutability(p, var_name, name_len, -1, actual_type, is_mutable);
                if (var_idx >= 0)
                {
                    // Mark this variable as initialized from __args__
                    p->variables[var_idx].is_args_slice = 1;
                    // Store argc value for later use (even though this is a slice type)
                    p->variables[var_idx].value = val_result.value;
                }
                return finalize_statement(p, "Expected ';' after variable declaration");
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
                p->temp_struct_string_values,
                p->temp_struct_string_lengths,
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
            int32_t struct_idx = p->temp_struct_def_idx;
            strncpy_s(actual_type, sizeof(actual_type), p->structs[struct_idx].name, _TRUNCATE);
            actual_type[sizeof(actual_type) - 1] = '\0';

            set_struct_variable_with_mutability(
                p,
                var_name,
                name_len,
                struct_idx,
                p->temp_struct_values,
                p->temp_struct_string_values,
                p->temp_struct_string_lengths,
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
    int32_t last_statement_value = 0;
    int32_t has_last_statement = 0;
    int32_t saw_statement = 0;

    // Parse let statements and assignments until none are found
    while (1)
    {
        skip_whitespace(p);

        // Check for function declaration
        if (is_keyword_at(p, "fn"))
        {
            // Look ahead to check if this function has already been parsed by prescan
            int32_t saved_pos = p->pos;
            p->pos += 2; // Skip 'fn'
            skip_whitespace(p);
            char func_name[32];
            int32_t name_len = parse_identifier(p, func_name, sizeof(func_name));

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
            int32_t saved_pos = p->pos;
            p->pos++; // Skip '*'
            skip_whitespace(p);
            char temp_name[32];
            int32_t name_len = parse_identifier(p, temp_name, sizeof(temp_name));

            // Check if this pointer variable is followed by an assignment operator
            int32_t is_assignment = has_assignment_operator(p);

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
        // Check for assignment statement (identifier followed by assignment operator or bracket)
        else if (isalpha(p->input[p->pos]) && !is_keyword_at(p, "if") && !is_keyword_at(p, "else") && !is_keyword_at(p, "while") && !is_keyword_at(p, "let") && !is_keyword_at(p, "match") && !is_keyword_at(p, "for") && !is_keyword_at(p, "fn") && !is_keyword_at(p, "struct"))
        {
            // Look ahead to determine assignment type (simple, array element, or pointer dereference)
            int32_t saved_pos = p->pos;
            char temp_name[32];
            int32_t name_len = parse_identifier(p, temp_name, sizeof(temp_name));

            // Check what follows the identifier
            skip_whitespace(p);
            int32_t is_array_element = (p->input[p->pos] == '['); // array[index] pattern
            int32_t is_assignment = has_assignment_operator(p);   // = or compound operator

            // If it's array element, skip past [...] to check for assignment
            if (is_array_element && !is_assignment)
            {
                // Skip bracket content to find assignment operator
                int32_t bracket_depth = 1;
                p->pos++; // Skip opening [
                while (p->input[p->pos] && bracket_depth > 0)
                {
                    if (p->input[p->pos] == '[')
                        bracket_depth++;
                    else if (p->input[p->pos] == ']')
                        bracket_depth--;
                    p->pos++;
                }
                skip_whitespace(p);
                is_assignment = has_assignment_operator(p);
            }

            // Reset position and handle accordingly
            p->pos = saved_pos;

            if (is_assignment)
            {
                // Use try_parse_assignment_expression which handles all assignment types
                InterpretResult assign_result = try_parse_assignment_expression(p);
                if (assign_result.has_error && strcmp(assign_result.error_message, "not_an_assignment") == 0)
                {
                    // Should not happen if is_assignment was true, but fallback
                    break;
                }
                else if (assign_result.has_error)
                {
                    return assign_result;
                }
                skip_whitespace(p);
                has_last_statement = 0;
                saw_statement = 1;
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
            int32_t saved_pos = p->pos;
            int32_t saved_var_count_block = p->var_count;
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
            // (Values are already updated in place)

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
            int32_t saved_pos = p->pos;
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
            int32_t name_len = parse_identifier(p, struct_name, sizeof(struct_name));
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
            int32_t field_count = 0;

            while (p->input[p->pos] && p->input[p->pos] != '}')
            {
                skip_whitespace(p);

                // Check if we're at the closing brace
                if (p->input[p->pos] == '}')
                    break;

                // Parse field name
                char field_name[32];
                int32_t field_name_len = parse_identifier(p, field_name, sizeof(field_name));
                if (field_name_len <= 0)
                {
                    return make_error("Expected field name in struct");
                }

                // Check for duplicate field name
                for (int32_t i = 0; i < field_count; i++)
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

                // Parse field type (could be Str[N], array type, or identifier)
                char field_type[64]; // Increased size to handle Str[32] etc.
                int32_t field_type_len = 0;

                if (p->input[p->pos] == '[')
                {
                    // Array type: [Type; Init; Total]
                    char array_elem_type[16];
                    int32_t array_init_count = 0;
                    int32_t array_total_count = 0;

                    InterpretResult array_type_result = parse_array_type_annotation(
                        p,
                        field_type,
                        sizeof(field_type),
                        array_elem_type,
                        sizeof(array_elem_type),
                        &array_init_count,
                        &array_total_count);
                    if (array_type_result.has_error)
                        return array_type_result;
                    field_type_len = strlen(field_type);
                }
                else if (is_keyword_at(p, "Str"))
                {
                    // Check for Str[N] type
                    const char *saved_pos_str = p->input + p->pos;
                    p->pos += 3; // Skip 'Str'
                    skip_whitespace(p);

                    if (p->input[p->pos] == '[')
                    {
                        int32_t string_size = 0;
                        InterpretResult string_type_result = parse_string_type_annotation(
                            p,
                            field_type,
                            sizeof(field_type),
                            &string_size);
                        if (string_type_result.has_error)
                            return string_type_result;
                        field_type_len = strlen(field_type);
                    }
                    else
                    {
                        return make_error("Expected '[' after Str in struct field type");
                    }
                }
                else
                {
                    // Regular identifier type
                    field_type_len = parse_identifier(p, field_type, sizeof(field_type));
                    if (field_type_len <= 0)
                    {
                        return make_error("Expected field type");
                    }
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

            for (int32_t i = 0; i < field_count; i++)
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
static char get_compound_operator_at(const char *input, int32_t pos, char op_char)
{
    if (input[pos] == op_char && input[pos + 1] == '=')
        return op_char;
    return '\0';
}

// Helper: Determine the operator at a position without consuming it
// Returns '+', '-', '*', '/', or '=' if found, '\0' otherwise
static char get_operator_at(const char *input, int32_t pos)
{
    const char compound_ops[] = "+-*/";
    for (int32_t i = 0; compound_ops[i]; i++)
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
static int32_t has_assignment_operator(Parser *p)
{
    int32_t temp_pos = p->pos;
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
static InterpretResult parse_and_apply_assignment(Parser *p, const char *var_name, int32_t name_len)
{
    // Find the variable
    int32_t idx = find_variable(p, var_name, name_len);
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
    int32_t final_value = val_result.value;
    if (compound_op != '=')
    {
        // Apply the compound operation using helper function
        int32_t current_value = p->variables[idx].value;
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
    int32_t saved_pos = p->pos;
    skip_whitespace(p);

    // Check for dereference assignment (*var = value)
    if (p->input[p->pos] == '*' && isalpha(p->input[p->pos + 1]))
    {
        p->pos++; // Skip '*'
        skip_whitespace(p);

        // Parse the pointer variable name
        char ptr_var_name[32];
        int32_t ptr_var_len = parse_identifier(p, ptr_var_name, sizeof(ptr_var_name));
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
        int32_t ptr_idx = find_variable(p, ptr_var_name, ptr_var_len);
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
        int32_t target_idx = p->variables[ptr_idx].pointer_target;
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
        int32_t name_pos = p->pos;
        char array_name[32];
        int32_t array_name_len = parse_identifier(p, array_name, sizeof(array_name));
        if (array_name_len > 0)
        {
            skip_whitespace(p);
            if (p->input[p->pos] == '[')
            {
                int32_t array_idx = find_variable(p, array_name, array_name_len);
                if (array_idx < 0)
                {
                    return make_error("Variable not found");
                }

                int32_t is_slice = is_pointer_to_array_type(p->variables[array_idx].type);

                if (!p->variables[array_idx].is_array && !is_slice)
                {
                    return make_error("Cannot index non-array variable");
                }

                int32_t index_value = 0;
                InterpretResult bracket_result = parse_bracket_index(p, &index_value);
                if (bracket_result.has_error)
                    return bracket_result;

                char compound_op = check_assignment_operator(p);
                if (compound_op == '\0')
                {
                    p->pos = saved_pos;
                    return make_error("not_an_assignment");
                }

                int32_t target_array_idx = array_idx;
                if (is_slice)
                {
                    // For slices, get the underlying array
                    target_array_idx = p->variables[array_idx].pointer_target;
                    if (target_array_idx < 0 || target_array_idx >= p->var_count || !p->variables[target_array_idx].is_array)
                    {
                        return make_error("Invalid slice pointer");
                    }

                    // Check if slice pointer is mutable (determined by pointer type, not variable mutability)
                    if (!is_mutable_pointer_type(p->variables[array_idx].type))
                    {
                        return make_error("Cannot assign through immutable slice");
                    }

                    // Check if the underlying array is mutable
                    if (!p->variables[target_array_idx].is_mutable)
                    {
                        return make_error("Cannot assign to immutable variable");
                    }

                    // Check bounds against slice
                    if (index_value < 0 || index_value >= (p->variables[array_idx].slice_end - p->variables[array_idx].slice_start))
                    {
                        return make_error("Array index out of bounds");
                    }

                    // Adjust index to actual array position
                    index_value += p->variables[array_idx].slice_start;
                }
                else
                {
                    // For regular arrays, check if the array variable is mutable
                    if (!p->variables[array_idx].is_mutable)
                    {
                        return make_error("Cannot assign to immutable variable");
                    }

                    // Regular array bounds checking
                    if (index_value < 0 || index_value >= p->variables[target_array_idx].array_total_count)
                    {
                        return make_error("Array index out of bounds");
                    }

                    if (index_value > p->variables[target_array_idx].array_init_count)
                    {
                        return make_error("Array elements must be initialized in order");
                    }
                }

                if (compound_op != '=' && index_value >= p->variables[target_array_idx].array_init_count)
                {
                    return make_error("Cannot use compound assignment on uninitialized element");
                }

                // Parse the assignment operator
                p->pos += (compound_op == '=' ? 1 : 2);
                skip_whitespace(p);

                // Parse RHS and calculate final value
                InterpretResult assign_result = parse_assignment_rhs(p, compound_op, p->variables[target_array_idx].array_values[index_value]);
                if (assign_result.has_error)
                    return assign_result;

                int32_t final_value = assign_result.value;

                // Validate final value against array element type
                if (p->has_tracked_suffix && p->tracked_suffix[0] != '\0')
                {
                    if (!is_type_compatible(p->variables[target_array_idx].array_element_type, p->tracked_suffix))
                    {
                        return make_error("Array element type mismatch");
                    }
                }
                else
                {
                    InterpretResult validation = validate_type(final_value, p->variables[target_array_idx].array_element_type);
                    if (validation.has_error)
                        return validation;
                }

                p->variables[target_array_idx].array_values[index_value] = final_value;
                if (index_value == p->variables[target_array_idx].array_init_count)
                {
                    p->variables[target_array_idx].array_init_count++;
                }

                return (InterpretResult){.value = final_value, .has_error = false, .error_message = NULL};
            }
            p->pos = name_pos;
        }
    }

    // Try to parse a regular identifier assignment
    char var_name[32];
    int32_t name_len = 0;
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
    int32_t name_len = 0;
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
        int32_t saved_pos = p->pos;
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
            int32_t deref_value = p->variables[ptr_expr.value].value;

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
        int32_t is_block = p->input[p->pos] == '{';
        int32_t saved_var_count = p->var_count;
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
            // (Values in p->variables[i] are already updated, var_count will be reset)
            // (The values persist because they're stored directly in the array)

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
        // (The variable at index i may have been modified in the block)
        // (We keep its current value, don't restore the old one)
        // (no action needed - values are already updated)

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

    int32_t result_value = (out_first_num && out_first_num->value) ? out_first_num->value : left.value;

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
static InterpretResult parse_binary_logical_op_generic(Parser *p, char op_char, int32_t is_or, BinaryOpParser operand_parser)
{
    skip_whitespace(p);

    InterpretResult left = operand_parser(p);
    if (left.has_error)
        return left;

    skip_whitespace(p);

    // Look for operator (both && and || repeat the character)
    int32_t found_operator = 0;
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
        int32_t result;
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
    int32_t is_comparison = 0;
    int32_t is_two_char = 0;
    char op1 = '\0';
    char op = '\0';
    int32_t result = 0;

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
static InterpretResult parse_logical_binary_op(Parser *p, char op_char, int32_t is_or)
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
static InterpretResult parse_keyword_header(Parser *p, const char *keyword, int32_t keyword_len, const char *context_msg)
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

static InterpretResult parse_if_header(Parser *p, InterpretResult *condition, Variable saved_vars[10], int32_t *saved_var_count)
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
    int32_t saved_var_count;
} IfHeaderState;

static IfHeaderState parse_if_header_state(Parser *p)
{
    IfHeaderState state = {0};
    state.header = parse_if_header(p, &state.condition, state.saved_vars, &state.saved_var_count);
    return state;
}

// Helper: Capture/restore temp string + tracked suffix across if/else branches
// This prevents code duplication and keeps branch-typed results consistent.
typedef struct
{
    int32_t has_temp_string;
    char temp_string_value[256];
    int32_t temp_string_len;
    int32_t has_tracked_suffix;
    char tracked_suffix[16];
} BranchTempState;

static BranchTempState capture_branch_temp_state(Parser *p)
{
    BranchTempState s = {0};
    if (!p)
        return s;

    s.has_temp_string = p->has_temp_string;
    s.temp_string_len = p->temp_string_len;
    if (s.has_temp_string)
    {
        strncpy_s(s.temp_string_value, sizeof(s.temp_string_value), p->temp_string_value, _TRUNCATE);
        s.temp_string_value[sizeof(s.temp_string_value) - 1] = '\0';
    }

    s.has_tracked_suffix = p->has_tracked_suffix;
    if (s.has_tracked_suffix)
    {
        strncpy_s(s.tracked_suffix, sizeof(s.tracked_suffix), p->tracked_suffix, _TRUNCATE);
        s.tracked_suffix[sizeof(s.tracked_suffix) - 1] = '\0';
    }

    return s;
}

static void restore_branch_temp_state(Parser *p, const BranchTempState *s)
{
    if (!p || !s)
        return;

    p->has_temp_string = s->has_temp_string;
    p->temp_string_len = s->temp_string_len;
    if (s->has_temp_string)
    {
        strncpy_s(p->temp_string_value, sizeof(p->temp_string_value), s->temp_string_value, _TRUNCATE);
        p->temp_string_value[sizeof(p->temp_string_value) - 1] = '\0';
    }
    else
    {
        p->temp_string_value[0] = '\0';
        p->temp_string_len = 0;
    }

    p->has_tracked_suffix = s->has_tracked_suffix;
    if (s->has_tracked_suffix)
    {
        strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), s->tracked_suffix, _TRUNCATE);
        p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
    }
    else
    {
        p->tracked_suffix[0] = '\0';
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
        int32_t saved_var_count_before_else;
        save_variable_state(p, saved_vars_before_else, &saved_var_count_before_else);

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
            restore_saved_vars(p, saved_vars_before_else, saved_var_count_before_else);
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
    int32_t cond_start_pos = p->pos;

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
    int32_t body_start_pos = loop_state.body_start_pos;
    int32_t body_end_pos = loop_state.body_end_pos;

    // Execute while loop with iteration cap
    static const int32_t MAX_ITERATIONS = 1024;

    for (int32_t iter = 0; iter < MAX_ITERATIONS; iter++)
    {
        // Reset to condition start and re-evaluate condition
        int32_t saved_pos = p->pos;
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
    int32_t name_len = parse_identifier(p, loop_var_name, sizeof(loop_var_name));
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
    int32_t start_value = start_result.value;

    // Expect '..' operator
    InterpretResult range_op = expect_range_operator(p);
    if (range_op.has_error)
        return range_op;

    // Parse end value
    InterpretResult end_result = parse_additive(p);
    if (end_result.has_error)
        return end_result;
    int32_t end_value = end_result.value;
    skip_whitespace(p);

    // Expect closing parenthesis
    InterpretResult close_paren = expect_closing_paren(p, "for loop range");
    if (close_paren.has_error)
        return close_paren;

    // Save position where body starts
    LoopState loop_state = init_loop_state(p);
    int32_t body_start_pos = loop_state.body_start_pos;
    int32_t body_end_pos = loop_state.body_end_pos;

    // Execute for loop with iteration cap
    static const int32_t MAX_ITERATIONS = 1024;

    // Check that loop variable hasn't been declared before
    if (has_variable_been_declared(p, loop_var_name, name_len))
    {
        return make_error("Variable already declared");
    }

    for (int32_t i = start_value; i < end_value && (i - start_value) < MAX_ITERATIONS; i++)
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
static InterpretResult apply_branch_state(Parser *p, Variable then_state_vars[10], int32_t then_state_var_count, InterpretResult then_expr)
{
    restore_saved_vars(p, then_state_vars, then_state_var_count);
    return (InterpretResult){.value = then_expr.value, .has_error = false, .error_message = NULL};
}

// Helper: Parse boolean pattern (true/false) with type validation
// Returns pattern_value (1 for true, 0 for false) or error if type mismatch
static InterpretResult parse_bool_pattern(Parser *p, int32_t match_value_is_bool, int32_t *out_pattern_value)
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
    int32_t match_value_is_bool = (p->has_tracked_suffix && strcmp(p->tracked_suffix, "Bool") == 0);

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
    int32_t found_match = 0;
    InterpretResult match_result = {.value = 0, .has_error = true, .error_message = NULL};
    int32_t has_non_wildcard_cases = 0;

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
        int32_t is_wildcard = 0;
        int32_t pattern_value = 0;

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

    BranchTempState then_temp = capture_branch_temp_state(p);

    // Capture the type of the then branch
    char then_type[8] = {0};
    int32_t then_has_type = p->has_tracked_suffix;
    if (p->has_tracked_suffix)
    {
        strncpy_s(then_type, sizeof(then_type), p->tracked_suffix, _TRUNCATE);
        then_type[sizeof(then_type) - 1] = '\0';
    }

    // Save the state after executing then branch
    Variable then_state_vars[10];
    int32_t then_state_var_count;
    save_variable_state(p, then_state_vars, &then_state_var_count);

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

        BranchTempState else_temp = capture_branch_temp_state(p);

        // Capture the type of the else branch
        char else_type[8] = {0};
        int32_t else_has_type = p->has_tracked_suffix;
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
            restore_branch_temp_state(p, &then_temp);
            return apply_branch_state(p, then_state_vars, then_state_var_count, then_expr);
        }
        else
        {
            // Condition is false, use else branch state (already applied)
            restore_branch_temp_state(p, &else_temp);
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
            restore_branch_temp_state(p, &then_temp);
            return apply_branch_state(p, then_state_vars, then_state_var_count, then_expr);
        }
        else
        {
            // Condition is false, don't apply then branch, return pre-condition state
            restore_saved_vars(p, header_state.saved_vars, header_state.saved_var_count);
            p->has_temp_string = 0;
            p->temp_string_len = 0;
            p->temp_string_value[0] = '\0';
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

    int32_t result_value = left.value;
    char tracked_suffix[16] = {0}; // Increased to accommodate "*mut I32"
    char last_suffix[16] = {0};    // Increased to accommodate "*mut I8"
    int32_t has_tracked_suffix = 0;
    int32_t in_mixed_types = 0; // Track if we've seen mixed types

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
                    int32_t type_idx = get_type_info_index(tracked_suffix);
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
                int32_t type_idx = get_type_info_index(tracked_suffix);
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
        int32_t type_idx = get_type_info_index(last_suffix);
        InterpretResult validation_result = validate_value_by_index(result_value, type_idx);
        if (validation_result.has_error)
        {
            return validation_result;
        }
    }

    // Update the Parser struct with the tracked suffix information
    if (has_tracked_suffix)
    {
        // Operators were found - use the type tracking from operator handling
        strncpy_s(p->tracked_suffix, sizeof(p->tracked_suffix), tracked_suffix, _TRUNCATE);
        p->tracked_suffix[sizeof(p->tracked_suffix) - 1] = '\0';
        p->has_tracked_suffix = 1;
    }
    else
    {
        // No operators found - this is just a simple operand being passed through
        // Preserve any tracking that was set by nested functions like parse_simple_operand()
        // Don't clear p->has_tracked_suffix automatically
    }

    return (InterpretResult){.value = (int)result_value, .has_error = false, .error_message = NULL};
}

// Helper: Pre-scan for top-level function declarations and register them
// This allows forward references to functions that are declared later
static InterpretResult prescan_function_declarations(Parser *p)
{
    // Save starting position and reset to beginning
    int32_t starting_pos = p->pos;
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
            int32_t brace_depth = 0;
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
    int32_t save_pos = p->pos;
    skip_whitespace(p);
    int32_t has_remaining = (p->input[p->pos] != '\0');
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

static int32_t is_keyword_lookahead(const char *str, const char *keyword, int32_t keyword_len)
{
    return strncmp(str, keyword, keyword_len) == 0 &&
           (isspace(str[keyword_len]) || str[keyword_len] == '(' || str[keyword_len] == '\0');
}

static int32_t is_expression(const char *str)
{
    int32_t in_number = 0;
    int32_t in_identifier = 0;

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

    for (int32_t i = 0; str[i]; i++)
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

// Helper: Initialize Parser struct with default values
static Parser init_parser(const char *str, int32_t argc, const char *const *argv)
{
    return (Parser){
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
        .temp_struct_string_values = {0},
        .temp_struct_string_lengths = {0},
        .declared_structs = {0},
        .declared_structs_count = 0,
        .structs = {0},
        .structs_count = 0,
        .argc = argc,
        .argv = argv};
}

// Helper: Parse single value (no operators)
static InterpretResult parse_single_value(const char *str)
{
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
    int32_t value = strtol(str, NULL, 10);

    // Validate range based on type suffix
    return validate_type(value, suffix_start);
}

// Helper: Core interpretation logic shared by interpret() and interpret_with_argc()
static InterpretResult interpret_impl(const char *str, int32_t argc, const char *const *argv)
{
    if (str == NULL || *str == '\0')
    {
        return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
    }

    // Check if this is an expression (contains operators)
    if (is_expression(str))
    {
        Parser p = init_parser(str, argc, argv);
        return parse_expression(&p);
    }

    return parse_single_value(str);
}

InterpretResult interpret(const char *str)
{
    return interpret_impl(str, -1, NULL);
}

InterpretResult interpret_with_argc(const char *str, int32_t argc, const char *const *argv)
{
    return interpret_impl(str, argc, argv);
}

// Helper: Generate and allocate C code for a program that returns a specific value
static CompileResult generate_c_program(const char *format, ...)
{
    char buffer[512];
    va_list args;
    va_start(args, format);
    int32_t len = vsnprintf(buffer, sizeof(buffer), format, args);
    va_end(args);

    if (len < 0 || len >= (int)sizeof(buffer))
        return (CompileResult){.code = NULL, .has_error = true, .error_message = "Internal compiler error: code generation buffer overflow"};

    // Allocate and copy the generated code
    char *out = (char *)malloc((size_t)len + 1);
    if (!out)
        return (CompileResult){.code = NULL, .has_error = true, .error_message = "Internal compiler error: memory allocation failed"};
    memcpy(out, buffer, (size_t)len + 1);
    return (CompileResult){.code = out, .has_error = false, .error_message = NULL};
}

// Function definition structure (used by __args__ transpiler)
typedef struct
{
    char name[32];
    char params[10][32];      // Parameter names
    char param_types[10][32]; // Parameter types
    int32_t param_count;
    char return_type[32]; // Return type
    char body[256];       // Function body expression
} FuncDef;

// Struct definition structure (used by __args__ transpiler)
typedef struct
{
    char name[32];
    char field_names[10][32]; // Field names
    char field_types[10][32]; // Field types (USize, I32, etc.)
    int32_t field_count;
} StructDef;

static void compile_args_append_char(char *out_buf, size_t buf_size, char c)
{
    char tmp[2] = {c, '\0'};
    strncat_s(out_buf, buf_size, tmp, _TRUNCATE);
}

static const FuncDef *compile_args_find_func(const FuncDef *funcs, int32_t func_count, const char *name)
{
    if (!funcs || func_count <= 0 || !name || !name[0])
        return NULL;

    for (int32_t i = 0; i < func_count; i++)
    {
        if (strcmp(funcs[i].name, name) == 0)
            return &funcs[i];
    }
    return NULL;
}

// compile_args_expression_ex: Translate a Tuff expression containing __args__ references
// into equivalent C code. Also optionally expands simple zero-arg function().length patterns.
static int32_t compile_args_expression_ex(const char *expr, char *out_buf, size_t buf_size,
                                          const char var_names[][32], const int32_t *var_types, int32_t var_count,
                                          const FuncDef *funcs, int32_t func_count)
{
    const char *s = expr;
    while (*s && isspace(*s))
        s++;

    // Build the expression piece by piece
    while (*s)
    {
        while (*s && isspace(*s))
            s++;
        if (!*s)
            break;

        if (strncmp(s, "__args__.length", 15) == 0)
        {
            strncat_s(out_buf, buf_size, "__tuff_argc", _TRUNCATE);
            s += 15;
        }
        else if (strncmp(s, "__args__[", 9) == 0)
        {
            s += 9;
            // Parse index
            int32_t index = 0;
            while (*s && isdigit(*s))
            {
                index = index * 10 + (*s - '0');
                s++;
            }
            if (strncmp(s, "].length", 8) == 0)
            {
                s += 8;
                char expr_buf[64];
                snprintf(expr_buf, sizeof(expr_buf), "(int)strlen(__tuff_argv[%d])", index);
                strncat_s(out_buf, buf_size, expr_buf, _TRUNCATE);
            }
            else if (*s == ']')
            {
                s++; // skip ']'
                char expr_buf[64];
                snprintf(expr_buf, sizeof(expr_buf), "__tuff_argv[%d]", index);
                strncat_s(out_buf, buf_size, expr_buf, _TRUNCATE);
            }
        }
        else if (isdigit(*s))
        {
            char number_buf[64] = {0};
            int32_t ni = 0;
            while (*s && isdigit(*s) && ni < (int)(sizeof(number_buf) - 1))
            {
                number_buf[ni++] = *s++;
            }
            number_buf[ni] = '\0';

            // Skip any type suffix (e.g., U8, I32, USize)
            if (*s && isalpha(*s))
            {
                int32_t type_len = suffix_length(s);
                if (type_len > 0)
                {
                    s += type_len;
                }
                else
                {
                    while (*s && isalpha(*s))
                        s++;
                }
            }

            strncat_s(out_buf, buf_size, number_buf, _TRUNCATE);
        }
        else if (isalpha(*s) || *s == '_')
        {
            // Identifier reference - extract name
            char name[32] = {0};
            int32_t ni = 0;
            while (*s && (isalnum(*s) || *s == '_') && ni < 31)
            {
                name[ni++] = *s++;
            }
            name[ni] = '\0';

            // Optional: function call handling
            const char *after_name = s;
            const char *t = after_name;
            while (*t && isspace(*t))
                t++;

            if (funcs && func_count > 0 && *t == '(')
            {
                // Parse to matching ')' so we can either pass-through calls or expand foo().length
                const char *call_start = t;
                const char *p = t + 1;
                int32_t depth = 1;
                while (*p && depth > 0)
                {
                    if (*p == '(')
                        depth++;
                    else if (*p == ')')
                        depth--;
                    p++;
                }

                if (depth == 0)
                {
                    const char *call_end = p; // points just after ')'
                    // Determine if call has arguments
                    int32_t call_has_args = 0;
                    for (const char *a = call_start + 1; a < (call_end - 1); a++)
                    {
                        if (!isspace(*a))
                        {
                            call_has_args = 1;
                            break;
                        }
                    }

                    // Check for .length after the call
                    const char *q = call_end;
                    while (*q && isspace(*q))
                        q++;

                    int32_t is_length_access = 0;
                    const char *after_length = q;
                    if (*q == '.')
                    {
                        q++;
                        while (*q && isspace(*q))
                            q++;
                        if (strncmp(q, "length", 6) == 0 && !(isalnum(q[6]) || q[6] == '_'))
                        {
                            is_length_access = 1;
                            after_length = q + 6;
                        }
                    }

                    const FuncDef *f = compile_args_find_func(funcs, func_count, name);
                    if (f && is_length_access && f->param_count == 0 && !call_has_args)
                    {
                        // Expand foo().length -> (int)strlen(<foo body>)
                        strncat_s(out_buf, buf_size, "(int)strlen(", _TRUNCATE);
                        compile_args_expression_ex(f->body, out_buf, buf_size, var_names, var_types, var_count, funcs, func_count);
                        strncat_s(out_buf, buf_size, ")", _TRUNCATE);
                        s = after_length;
                        continue;
                    }

                    // Not a supported inline: emit call with transpiled arguments
                    strncat_s(out_buf, buf_size, name, _TRUNCATE);
                    strncat_s(out_buf, buf_size, "(", _TRUNCATE);

                    // Extract and transpile arguments between parentheses
                    const char *args_start = call_start + 1;
                    const char *args_end = call_end - 1;

                    if (args_start < args_end)
                    {
                        char args_text[256] = {0};
                        size_t args_len = (size_t)(args_end - args_start);
                        if (args_len >= sizeof(args_text))
                            args_len = sizeof(args_text) - 1;
                        memcpy(args_text, args_start, args_len);
                        args_text[args_len] = '\0';

                        // Recursively transpile the arguments
                        compile_args_expression_ex(args_text, out_buf, buf_size, var_names, var_types, var_count, funcs, func_count);
                    }

                    strncat_s(out_buf, buf_size, ")", _TRUNCATE);
                    s = call_end;
                    continue;
                }
            }

            // Check if followed by .field or .length
            if (*s == '.')
            {
                s++; // skip '.'

                // Parse the property/field name
                char prop_or_field[32] = {0};
                int32_t pi = 0;
                while (*s && (isalnum(*s) || *s == '_') && pi < 31)
                {
                    prop_or_field[pi++] = *s++;
                }
                prop_or_field[pi] = '\0';

                // Check if this is a property access (.length) or struct field
                if (strcmp(prop_or_field, "length") == 0)
                {
                    // Direct property access: variable.length
                    int32_t vtype = 0;
                    for (int32_t i = 0; i < var_count; i++)
                    {
                        if (strcmp(var_names[i], name) == 0)
                        {
                            vtype = var_types[i];
                            break;
                        }
                    }
                    if (vtype == 3)
                    {
                        // args slice - length is argc
                        strncat_s(out_buf, buf_size, "argc", _TRUNCATE);
                    }
                    else if (vtype == 2)
                    {
                        // *Str - length is strlen
                        char expr_buf[64];
                        snprintf(expr_buf, sizeof(expr_buf), "(int)strlen(%s)", name);
                        strncat_s(out_buf, buf_size, expr_buf, _TRUNCATE);
                    }
                    else
                    {
                        // Unknown type, just emit variable name with .length
                        strncat_s(out_buf, buf_size, name, _TRUNCATE);
                    }
                }
                else
                {
                    // Struct field access or chained property: variable.field[.property]
                    if (*s == '.')
                    {
                        s++; // skip the dot
                        char nested_prop[32] = {0};
                        int32_t npi = 0;
                        while (*s && (isalnum(*s) || *s == '_') && npi < 31)
                        {
                            nested_prop[npi++] = *s++;
                        }
                        nested_prop[npi] = '\0';

                        if (strcmp(nested_prop, "length") == 0)
                        {
                            // Struct field is a string, emit strlen wrapper
                            char temp_buf[64] = {0};
                            snprintf(temp_buf, sizeof(temp_buf), "(int)strlen(%s.%s)", name, prop_or_field);
                            strncat_s(out_buf, buf_size, temp_buf, _TRUNCATE);
                        }
                        else
                        {
                            // Unknown nested property, emit as chained access
                            strncat_s(out_buf, buf_size, name, _TRUNCATE);
                            strncat_s(out_buf, buf_size, ".", _TRUNCATE);
                            strncat_s(out_buf, buf_size, prop_or_field, _TRUNCATE);
                            strncat_s(out_buf, buf_size, ".", _TRUNCATE);
                            strncat_s(out_buf, buf_size, nested_prop, _TRUNCATE);
                        }
                    }
                    else
                    {
                        // Plain struct field access
                        strncat_s(out_buf, buf_size, name, _TRUNCATE);
                        strncat_s(out_buf, buf_size, ".", _TRUNCATE);
                        strncat_s(out_buf, buf_size, prop_or_field, _TRUNCATE);
                    }
                }
            }
            else
            {
                // Plain identifier reference
                strncat_s(out_buf, buf_size, name, _TRUNCATE);
            }
        }
        else if (*s == '+' || *s == '-' || *s == '*' || *s == '/')
        {
            char op[4] = {' ', *s, ' ', '\0'};
            strncat_s(out_buf, buf_size, op, _TRUNCATE);
            s++;
        }
        else
        {
            // Preserve unrecognized characters (e.g., parentheses for function calls)
            compile_args_append_char(out_buf, buf_size, *s);
            s++;
        }
    }

    return 0;
}

// compile_args_expression: Translate a Tuff expression containing __args__ references
// into equivalent C code. Appends to out_buf. Returns 0 on success, -1 on error.
// var_types tracks declared variables: 0=unknown, 1=numeric/USize, 2=*Str, 3=*[*Str] (args slice)
static int32_t compile_args_expression(const char *expr, char *out_buf, size_t buf_size,
                                       const char var_names[][32], const int32_t *var_types, int32_t var_count)
{
    return compile_args_expression_ex(expr, out_buf, buf_size, var_names, var_types, var_count, NULL, 0);
}

static const char *compile_args_parse_identifier(const char *p, char *out_name, size_t name_size)
{
    int32_t vi = 0;
    while (*p && (isalnum(*p) || *p == '_') && vi < (int)(name_size - 1))
    {
        out_name[vi++] = *p++;
    }
    out_name[vi] = '\0';
    return p;
}

static void compile_args_register_var(char var_names[][32], int32_t *var_types, int32_t *var_count,
                                      const char *vname, int32_t vtype)
{
    if (*var_count < 16)
    {
        strcpy_s(var_names[*var_count], sizeof(var_names[*var_count]), vname);
        var_types[*var_count] = vtype;
        (*var_count)++;
    }
}

static void compile_args_emit_args_slice_decl(char *c_code, size_t c_code_size, const char *vname)
{
    char decl[128];
    snprintf(decl, sizeof(decl), "    char **%s = argv;\n", vname);
    strncat_s(c_code, c_code_size, decl, _TRUNCATE);
}

static void compile_args_emit_decl(char *c_code, size_t c_code_size, const char *type_prefix,
                                   const char *vname, const char *expr,
                                   const char var_names[][32], const int32_t *var_types, int32_t var_count)
{
    char decl[256];
    snprintf(decl, sizeof(decl), "    %s%s = ", type_prefix, vname);
    strncat_s(c_code, c_code_size, decl, _TRUNCATE);
    compile_args_expression(expr, c_code, c_code_size, var_names, var_types, var_count);
    strncat_s(c_code, c_code_size, ";\n", _TRUNCATE);
}

// Helper: Expand expression with function call inlining
// For simple cases like get().length where get() returns a variable
static int32_t compile_args_expression_with_funcs(const char *expr, char *out_buf, size_t buf_size,
                                                  const char var_names[][32], const int32_t *var_types, int32_t var_count,
                                                  const FuncDef *funcs, int32_t func_count)
{
    return compile_args_expression_ex(expr, out_buf, buf_size, var_names, var_types, var_count, funcs, func_count);
}

// Helper: Map Tuff type to C type for struct fields
static void tuff_type_to_c_type(const char *tuff_type, char *c_type, size_t c_type_size)
{
    if (!tuff_type || !tuff_type[0])
    {
        strncpy_s(c_type, c_type_size, "int", _TRUNCATE);
        return;
    }

    // Handle stack string types Str[N]
    if (is_string_type_string(tuff_type))
    {
        int32_t size = extract_string_type_size(tuff_type);
        if (size > 0)
        {
            char buf[64];
            snprintf(buf, sizeof(buf), "char[%d]", size);
            strncpy_s(c_type, c_type_size, buf, _TRUNCATE);
        }
        else
        {
            strncpy_s(c_type, c_type_size, "char*", _TRUNCATE);
        }
        return;
    }

    // Handle pointer types
    if (strcmp(tuff_type, "*Str") == 0 || strcmp(tuff_type, "*[*Str]") == 0)
    {
        strncpy_s(c_type, c_type_size, "char*", _TRUNCATE);
    }
    else if (strcmp(tuff_type, "USize") == 0)
    {
        // Use a real stdint type ("unsigned int64_t" is not valid C)
        strncpy_s(c_type, c_type_size, "uint64_t", _TRUNCATE);
    }
    else if (strcmp(tuff_type, "ISize") == 0)
    {
        strncpy_s(c_type, c_type_size, "int64_t", _TRUNCATE);
    }
    else if (strcmp(tuff_type, "Bool") == 0)
    {
        strncpy_s(c_type, c_type_size, "int", _TRUNCATE);
    }
    else if (strcmp(tuff_type, "Char") == 0)
    {
        strncpy_s(c_type, c_type_size, "char", _TRUNCATE);
    }
    else if (strncmp(tuff_type, "U8", 2) == 0 || strncmp(tuff_type, "U16", 3) == 0 ||
             strncmp(tuff_type, "U32", 3) == 0 || strncmp(tuff_type, "U64", 3) == 0)
    {
        strncpy_s(c_type, c_type_size, "int", _TRUNCATE);
    }
    else if (strncmp(tuff_type, "I8", 2) == 0 || strncmp(tuff_type, "I16", 3) == 0 ||
             strncmp(tuff_type, "I32", 3) == 0 || strncmp(tuff_type, "I64", 3) == 0)
    {
        strncpy_s(c_type, c_type_size, "int", _TRUNCATE);
    }
    else
    {
        // Default to int32_t for unknown types
        strncpy_s(c_type, c_type_size, "int", _TRUNCATE);
    }
}

// Helper: Convert if-else expressions to C ternary operators recursively
static int32_t compile_args_convert_if_else(const char *src, char *out, size_t out_size)
{
    const char *p = src;
    while (*p && isspace(*p))
        p++;

    if (strncmp(p, "if", 2) != 0 || !isspace(p[2]))
    {
        // Not an if-else, copy as-is
        strncat_s(out, out_size, src, _TRUNCATE);
        return 0;
    }

    p += 2; // skip "if"
    while (*p && isspace(*p))
        p++;

    if (*p != '(')
    {
        strncat_s(out, out_size, src, _TRUNCATE);
        return 0;
    }
    p++; // skip '('

    // Extract condition (find matching ')')
    int32_t paren_depth = 1;
    const char *cond_start = p;
    while (*p && paren_depth > 0)
    {
        if (*p == '(')
            paren_depth++;
        else if (*p == ')')
            paren_depth--;
        p++;
    }
    size_t cond_len = (size_t)(p - cond_start - 1);

    // Extract condition
    char condition[256] = {0};
    if (cond_len >= sizeof(condition))
        cond_len = sizeof(condition) - 1;
    memcpy(condition, cond_start, cond_len);
    condition[cond_len] = '\0';

    // Skip whitespace after ')'
    while (*p && isspace(*p))
        p++;

    // Extract then-branch (until "else")
    const char *then_start = p;
    const char *else_keyword = NULL;

    // Find "else" keyword (but not inside nested if-else)
    int32_t depth = 0;
    const char *scan = p;
    while (*scan)
    {
        if (strncmp(scan, "if", 2) == 0 && (scan == p || isspace(scan[-1])) && isspace(scan[2]))
            depth++;
        else if (strncmp(scan, "else", 4) == 0 && (scan == p || isspace(scan[-1])) &&
                 (isspace(scan[4]) || scan[4] == '\0'))
        {
            if (depth == 0)
            {
                else_keyword = scan;
                break;
            }
            depth--;
        }
        scan++;
    }

    if (!else_keyword)
    {
        // No else branch, can't convert to ternary
        strncat_s(out, out_size, src, _TRUNCATE);
        return 0;
    }

    size_t then_len = (size_t)(else_keyword - then_start);
    char then_branch[256] = {0};
    if (then_len >= sizeof(then_branch))
        then_len = sizeof(then_branch) - 1;
    memcpy(then_branch, then_start, then_len);
    then_branch[then_len] = '\0';

    // Trim trailing whitespace from then-branch
    while (then_len > 0 && isspace(then_branch[then_len - 1]))
        then_branch[--then_len] = '\0';

    // Skip "else" keyword
    p = else_keyword + 4;
    while (*p && isspace(*p))
        p++;

    // Extract else-branch (rest of string)
    const char *else_start = p;

    // Generate ternary: (condition) ? (then) : (else)
    strncat_s(out, out_size, "(", _TRUNCATE);
    strncat_s(out, out_size, condition, _TRUNCATE);
    strncat_s(out, out_size, ") ? (", _TRUNCATE);

    // Recursively convert then-branch
    compile_args_convert_if_else(then_branch, out, out_size);

    strncat_s(out, out_size, ") : (", _TRUNCATE);

    // Recursively convert else-branch
    compile_args_convert_if_else(else_start, out, out_size);

    strncat_s(out, out_size, ")", _TRUNCATE);

    return 0;
}

// Helper: Emit function signature (name and parameters)
static void emit_function_signature(char *c_code, size_t c_code_size, const FuncDef *func, int32_t with_semicolon)
{
    // Convert return type
    char c_return_type[32] = {0};
    if (func->return_type[0])
        tuff_type_to_c_type(func->return_type, c_return_type, sizeof(c_return_type));
    else
        strcpy_s(c_return_type, sizeof(c_return_type), "int");

    strncat_s(c_code, c_code_size, c_return_type, _TRUNCATE);
    strncat_s(c_code, c_code_size, " ", _TRUNCATE);
    strncat_s(c_code, c_code_size, func->name, _TRUNCATE);
    strncat_s(c_code, c_code_size, "(", _TRUNCATE);
    for (int32_t j = 0; j < func->param_count; j++)
    {
        if (j > 0)
            strncat_s(c_code, c_code_size, ", ", _TRUNCATE);

        // Convert parameter type
        char c_param_type[32] = {0};
        if (func->param_types[j][0])
            tuff_type_to_c_type(func->param_types[j], c_param_type, sizeof(c_param_type));
        else
            strcpy_s(c_param_type, sizeof(c_param_type), "int");

        strncat_s(c_code, c_code_size, c_param_type, _TRUNCATE);
        strncat_s(c_code, c_code_size, " ", _TRUNCATE);
        strncat_s(c_code, c_code_size, func->params[j], _TRUNCATE);
    }
    strncat_s(c_code, c_code_size, ")", _TRUNCATE);
    if (with_semicolon)
        strncat_s(c_code, c_code_size, ";\n", _TRUNCATE);
}

// Helper: Parse statement from source into buffer, trim whitespace, return trimmed pointer
static const char *parse_statement_setup(const char *s, const char *semi, char *stmt, size_t stmt_size, size_t *stmt_len_out)
{
    size_t stmt_len = (size_t)(semi - s);
    if (stmt_len >= stmt_size)
        stmt_len = stmt_size - 1;
    memcpy(stmt, s, stmt_len);
    stmt[stmt_len] = '\0';

    const char *st = stmt;
    while (*st && isspace(*st))
        st++;

    if (stmt_len_out)
        *stmt_len_out = stmt_len;
    return st;
}

// Helper: Emit variable assignment statement
static void emit_var_assignment(char *c_code, size_t c_code_size, const char *vname, const char *expr,
                                const char var_names[][32], const int32_t *var_types, int32_t var_count)
{
    char assign[256];
    snprintf(assign, sizeof(assign), "    %s = ", vname);
    strncat_s(c_code, c_code_size, assign, _TRUNCATE);
    compile_args_expression(expr, c_code, c_code_size, var_names, var_types, var_count);
    strncat_s(c_code, c_code_size, ";\n", _TRUNCATE);
}

// Helper: Skip whitespace and check if at specific character
static inline const char *skip_to_char(const char *p, char c, int32_t *found)
{
    while (*p && isspace(*p))
        p++;
    if (found)
        *found = (*p == c);
    return p;
}

// Generic callback for parsing items in delimited lists
typedef const char *(*ItemParser)(const char *p, void *data, int32_t *should_continue);

// Helper: Parse delimited list (e.g., "{a; b;}" or "(x, y)")
// Calls item_parser for each item until closing delimiter
static const char *parse_delimited_list(const char *p, char open_delim, char close_delim,
                                        ItemParser item_parser, void *data)
{
    int32_t at_open;
    p = skip_to_char(p, open_delim, &at_open);
    if (at_open)
        p++;

    int32_t at_close = 0;
    while (*p && !at_close)
    {
        p = skip_to_char(p, close_delim, &at_close);
        if (at_close)
            break;

        int32_t should_continue = 1;
        p = item_parser(p, data, &should_continue);
        if (!should_continue)
            break;
    }
    return p;
}

// Parser callback for struct fields
static const char *parse_struct_field_item(const char *p, void *data, int32_t *should_continue)
{
    StructDef *s = (StructDef *)data;

    char field_name[32] = {0};
    p = compile_args_parse_identifier(p, field_name, sizeof(field_name));

    int32_t at_colon;
    p = skip_to_char(p, ':', &at_colon);
    if (at_colon)
    {
        p++;
        while (*p && isspace(*p))
            p++;

        char field_type[32] = {0};
        int32_t ti = 0;
        while (*p && !isspace(*p) && *p != ';' && *p != '}' && ti < 31)
            field_type[ti++] = *p++;
        field_type[ti] = '\0';

        if (field_name[0] && s->field_count < 10)
        {
            strcpy_s(s->field_names[s->field_count], sizeof(s->field_names[s->field_count]), field_name);
            strcpy_s(s->field_types[s->field_count], sizeof(s->field_types[s->field_count]), field_type);
            s->field_count++;
        }
    }

    while (*p && *p != ';' && *p != '}')
        p++;
    if (*p == ';')
        p++;

    *should_continue = 1;
    return p;
}

// Parser callback for function parameters
static const char *parse_function_param_item(const char *p, void *data, int32_t *should_continue)
{
    FuncDef *f = (FuncDef *)data;

    char param_name[32] = {0};
    p = compile_args_parse_identifier(p, param_name, sizeof(param_name));
    if (param_name[0] && f->param_count < 10)
    {
        strcpy_s(f->params[f->param_count], sizeof(f->params[f->param_count]), param_name);
    }

    int32_t at_colon;
    p = skip_to_char(p, ':', &at_colon);
    if (at_colon)
    {
        p++;

        // Skip whitespace after colon
        while (*p && isspace(*p))
            p++;

        // Extract parameter type
        char param_type[32] = {0};
        int32_t type_len = 0;
        while (*p && *p != ',' && *p != ')' && !isspace(*p) && type_len < 31)
        {
            param_type[type_len++] = *p++;
        }
        param_type[type_len] = '\0';

        if (param_type[0] && f->param_count < 10)
        {
            strcpy_s(f->param_types[f->param_count], sizeof(f->param_types[f->param_count]), param_type);
            f->param_count++;
        }

        // Skip to comma or closing paren
        while (*p && *p != ',' && *p != ')')
            p++;
    }

    if (*p == ',')
        p++;

    *should_continue = 1;
    return p;
}

// Helper: Parse struct field definitions from "{ field : Type; ... }"
static inline const char *parse_struct_fields(const char *p, StructDef *s)
{
    return parse_delimited_list(p, '{', '}', parse_struct_field_item, s);
}

// Helper: Parse function parameters from "(param: Type, ...)"
static inline const char *parse_function_params(const char *p, FuncDef *f)
{
    p = parse_delimited_list(p, '(', ')', parse_function_param_item, f);
    // Ensure we skip the closing ')'
    if (*p == ')')
        p++;
    return p;
}

// Helper: Find the statement-ending semicolon, respecting brace depth
// For struct definitions, returns position after closing brace
static const char *find_statement_end(const char *s)
{
    // Skip leading whitespace
    const char *p = s;
    while (*p && isspace(*p))
        p++;

    // Check if this is a struct definition
    if (strncmp(p, "struct ", 7) == 0)
    {
        // For structs, find the closing brace
        int32_t brace_depth = 0;
        int32_t found_open = 0;
        while (*p)
        {
            if (*p == '{')
            {
                brace_depth++;
                found_open = 1;
            }
            else if (*p == '}')
            {
                brace_depth--;
                if (found_open && brace_depth == 0)
                {
                    // Return position of the closing brace (it will be treated as statement end)
                    return p;
                }
            }
            p++;
        }
        return NULL;
    }

    // For other statements, find semicolon respecting brace depth
    int32_t brace_depth = 0;
    p = s;
    while (*p)
    {
        if (*p == '{')
            brace_depth++;
        else if (*p == '}')
            brace_depth--;
        else if (*p == ';' && brace_depth == 0)
            return p;
        p++;
    }
    return NULL;
}

// Helper: Check if identifier is a Tuff keyword
static int32_t is_tuff_keyword(const char *ident)
{
    const char *keywords[] = {"if", "else", "while", "for", "let", "mut",
                              "fn", "return", "struct", "match", "case",
                              "true", "false", "in", NULL};
    for (int32_t i = 0; keywords[i]; i++)
    {
        if (strcmp(ident, keywords[i]) == 0)
            return 1;
    }
    return 0;
}

// compile_args_source: Transpile Tuff source containing __args__ into a complete C program.
// Returns a CompileResult with generated C code.
static CompileResult compile_args_source(const char *source)
{
    char c_code[4096] = {0};
    strcpy_s(c_code, sizeof(c_code),
             "#include <stdlib.h>\n"
             "#include <string.h>\n"
             "#include <stdint.h>\n\n");

    // Track variable declarations: name, type (1=numeric, 2=*Str, 3=*[*Str], 4=struct)
    char var_names[16][32] = {{0}};
    int32_t var_types[16] = {0};
    int32_t var_count = 0;
    char var_struct_types[16][32] = {{0}}; // For struct variables, stores struct type name

    // Track function definitions with parameters
    FuncDef functions[10] = {{{0}}};
    int32_t func_count = 0;

    // Track struct definitions
    StructDef structs[10] = {{{0}}};
    int32_t struct_count = 0;

    // Flag: whether __args__ appears anywhere in the source
    int32_t any_args_in_source = (source && strstr(source, "__args__") != NULL) ? 1 : 0;

    // Flag: whether any function uses __args__ (starts true if source has __args__)
    int32_t any_func_uses_args = any_args_in_source;

    // First pass: Extract all struct and function definitions
    const char *s = source;
    while (*s)
    {
        while (*s && isspace(*s))
            s++;
        if (!*s)
            break;

        const char *semi = find_statement_end(s);
        if (semi == NULL)
            break; // No more statements

        char stmt[512] = {0};
        const char *st = parse_statement_setup(s, semi, stmt, sizeof(stmt), NULL);

        if (strncmp(st, "struct ", 7) == 0)
        {
            // Struct definition: struct Name { field : Type; ... }
            const char *p = st + 7;
            while (*p && isspace(*p))
                p++;

            // Parse struct name
            p = compile_args_parse_identifier(p, structs[struct_count].name, sizeof(structs[struct_count].name));

            // Parse struct fields using helper
            p = parse_struct_fields(p, &structs[struct_count]);

            struct_count++;
        }
        else if (strncmp(st, "fn ", 3) == 0)
        {
            // Function definition: fn name(param: Type) => expr;
            const char *p = st + 3;
            while (*p && isspace(*p))
                p++;

            // Parse function name
            p = compile_args_parse_identifier(p, functions[func_count].name, sizeof(functions[func_count].name));

            // Parse function parameters using helper
            p = parse_function_params(p, &functions[func_count]);

            // Parse and store return type ': Type'
            while (*p && isspace(*p))
                p++;
            if (*p == ':')
            {
                p++;
                while (*p && isspace(*p))
                    p++;

                // Extract return type
                char return_type[32] = {0};
                int32_t ret_type_len = 0;
                while (*p && *p != '=' && !isspace(*p) && ret_type_len < 31)
                {
                    return_type[ret_type_len++] = *p++;
                }
                return_type[ret_type_len] = '\0';

                if (return_type[0])
                {
                    strcpy_s(functions[func_count].return_type, sizeof(functions[func_count].return_type), return_type);
                }
            }

            // Expect '=>'
            while (*p && isspace(*p))
                p++;
            if (*p == '=' && *(p + 1) == '>')
            {
                p += 2;
                while (*p && isspace(*p))
                    p++;
            }

            // Store function body
            strncpy_s(functions[func_count].body, sizeof(functions[func_count].body), p, _TRUNCATE);
            func_count++;
        }

        s = semi + 1;
    }

    // Generate function declarations and implementations
    if (func_count > 0 || struct_count > 0 || any_args_in_source)
    {
        // Detect global variables: variables referenced in function bodies but not in parameters
        char global_vars[16][32] = {{0}};
        int32_t global_count = 0;

        for (int32_t i = 0; i < func_count; i++)
        {
            // Scan function body for variable references
            const char *body = functions[i].body;
            while (*body)
            {
                if (isalpha(*body) || *body == '_')
                {
                    char ident[32] = {0};
                    int32_t idx = 0;
                    const char *start = body;
                    while ((isalnum(*body) || *body == '_') && idx < 31)
                        ident[idx++] = *body++;
                    ident[idx] = '\0';

                    // Check if this identifier is a parameter of this function
                    int32_t is_param = 0;
                    for (int32_t j = 0; j < functions[i].param_count; j++)
                    {
                        if (strcmp(ident, functions[i].params[j]) == 0)
                        {
                            is_param = 1;
                            break;
                        }
                    }

                    // Check if it's a function name
                    int32_t is_func = 0;
                    for (int32_t j = 0; j < func_count; j++)
                    {
                        if (strcmp(ident, functions[j].name) == 0)
                        {
                            is_func = 1;
                            break;
                        }
                    }

                    // If not a parameter and not a function, it might be a global variable
                    if (!is_param && !is_func && strlen(ident) > 0)
                    {
                        // Filter out keywords
                        if (is_tuff_keyword(ident))
                        {
                            // Skip keywords
                        }
                        else
                        {
                            // Check if already in global list
                            int32_t already_global = 0;
                            for (int32_t j = 0; j < global_count; j++)
                            {
                                if (strcmp(global_vars[j], ident) == 0)
                                {
                                    already_global = 1;
                                    break;
                                }
                            }

                            if (!already_global && global_count < 16)
                            {
                                strcpy_s(global_vars[global_count], sizeof(global_vars[global_count]), ident);
                                global_count++;
                            }
                        }
                    }
                }
                else
                {
                    body++;
                }
            }
        }

        // Generate struct definitions
        for (int32_t i = 0; i < struct_count; i++)
        {
            strncat_s(c_code, sizeof(c_code), "typedef struct {\n", _TRUNCATE);
            for (int32_t j = 0; j < structs[i].field_count; j++)
            {
                char c_field_type[32] = {0};
                tuff_type_to_c_type(structs[i].field_types[j], c_field_type, sizeof(c_field_type));

                // Handle array types: extract base type and array brackets
                // If c_field_type is "char[32]", we need to output "char fieldname[32];"
                // not "char[32] fieldname;"
                char base_type[32] = {0};
                char array_brackets[32] = {0};

                // Find the opening bracket in c_field_type
                const char *bracket_pos = strchr(c_field_type, '[');
                if (bracket_pos != NULL)
                {
                    // Extract base type (everything before the bracket)
                    int32_t base_len = (int32_t)(bracket_pos - c_field_type);
                    if (base_len > 0 && base_len < 31)
                    {
                        strncpy_s(base_type, sizeof(base_type), c_field_type, base_len);
                        base_type[base_len] = '\0';
                    }
                    // Extract array brackets (from bracket onwards)
                    strcpy_s(array_brackets, sizeof(array_brackets), bracket_pos);
                }
                else
                {
                    // No brackets, use the type as-is
                    strcpy_s(base_type, sizeof(base_type), c_field_type);
                }

                strncat_s(c_code, sizeof(c_code), "    ", _TRUNCATE);
                strncat_s(c_code, sizeof(c_code), base_type, _TRUNCATE);
                strncat_s(c_code, sizeof(c_code), " ", _TRUNCATE);
                strncat_s(c_code, sizeof(c_code), structs[i].field_names[j], _TRUNCATE);
                strncat_s(c_code, sizeof(c_code), array_brackets, _TRUNCATE);
                strncat_s(c_code, sizeof(c_code), ";\n", _TRUNCATE);
            }
            strncat_s(c_code, sizeof(c_code), "} ", _TRUNCATE);
            strncat_s(c_code, sizeof(c_code), structs[i].name, _TRUNCATE);
            strncat_s(c_code, sizeof(c_code), ";\n\n", _TRUNCATE);
        }

        // Generate global variable declarations (will be initialized in main)

        // Check if any function uses __args__ (also check in any_func_uses_args from first pass)
        for (int32_t i = 0; i < func_count && !any_func_uses_args; i++)
        {
            if (strstr(functions[i].body, "__args__") != NULL)
                any_func_uses_args = 1;
        }

        // If __args__ appears anywhere, declare argc/argv as globals with non-conflicting names
        if (any_args_in_source)
        {
            strncat_s(c_code, sizeof(c_code), "// Global argc/argv for __args__ access\n", _TRUNCATE);
            strncat_s(c_code, sizeof(c_code), "int32_t __tuff_argc = 0;\n", _TRUNCATE);
            strncat_s(c_code, sizeof(c_code), "char **__tuff_argv = NULL;\n\n", _TRUNCATE);
        }

        for (int32_t i = 0; i < global_count; i++)
        {
            strncat_s(c_code, sizeof(c_code), "int32_t ", _TRUNCATE);
            strncat_s(c_code, sizeof(c_code), global_vars[i], _TRUNCATE);
            strncat_s(c_code, sizeof(c_code), ";\n", _TRUNCATE);
        }
        if (global_count > 0)
            strncat_s(c_code, sizeof(c_code), "\n", _TRUNCATE);

        // Generate forward declarations
        for (int32_t i = 0; i < func_count; i++)
        {
            emit_function_signature(c_code, sizeof(c_code), &functions[i], 1);
        }
        if (func_count > 0)
            strncat_s(c_code, sizeof(c_code), "\n", _TRUNCATE);

        // Generate function implementations
        for (int32_t i = 0; i < func_count; i++)
        {
            emit_function_signature(c_code, sizeof(c_code), &functions[i], 0);
            strncat_s(c_code, sizeof(c_code), " {\n    return ", _TRUNCATE);

            // Check if function body contains __args__
            if (strstr(functions[i].body, "__args__") != NULL)
            {
                // Body contains __args__, need proper transpilation
                char temp_body[512] = {0};

                // First convert if-else to ternary
                compile_args_convert_if_else(functions[i].body, temp_body, sizeof(temp_body));

                // Now transpile __args__ references in the result
                char body_transpiled[512] = {0};
                compile_args_expression_with_funcs(temp_body, body_transpiled, sizeof(body_transpiled),
                                                   var_names, var_types, var_count, functions, func_count);

                strncat_s(c_code, sizeof(c_code), body_transpiled, _TRUNCATE);
            }
            else
            {
                // Body doesn't contain __args__, just convert if-else to ternary
                char body_converted[512] = {0};
                compile_args_convert_if_else(functions[i].body, body_converted, sizeof(body_converted));
                strncat_s(c_code, sizeof(c_code), body_converted, _TRUNCATE);
            }

            strncat_s(c_code, sizeof(c_code), ";\n}\n\n", _TRUNCATE);
        }

        // Store global variable names for later - mark them for special handling
        for (int32_t i = 0; i < global_count; i++)
        {
            if (var_count < 16)
            {
                strcpy_s(var_names[var_count], sizeof(var_names[var_count]), global_vars[i]);
                var_types[var_count] = -1; // Special marker for global variables
                var_count++;
            }
        }
    }

    // Generate main function
    strncat_s(c_code, sizeof(c_code), "int32_t main(int32_t argc, char **argv) {\n", _TRUNCATE);

    // Initialize global argc/argv if __args__ appears anywhere
    if (any_args_in_source)
    {
        strncat_s(c_code, sizeof(c_code), "    __tuff_argc = argc;\n", _TRUNCATE);
        strncat_s(c_code, sizeof(c_code), "    __tuff_argv = argv;\n", _TRUNCATE);
    }

    // Second pass: Process variable declarations and return expression
    s = source;
    while (*s)
    {
        while (*s && isspace(*s))
            s++;
        if (!*s)
            break;

        const char *semi = find_statement_end(s);
        if (semi == NULL)
        {
            // Final return expression
            strncat_s(c_code, sizeof(c_code), "    return ", _TRUNCATE);
            compile_args_expression_with_funcs(s, c_code, sizeof(c_code), var_names, var_types, var_count,
                                               functions, func_count);
            strncat_s(c_code, sizeof(c_code), ";\n", _TRUNCATE);
            break;
        }

        char stmt[512] = {0};
        const char *st = parse_statement_setup(s, semi, stmt, sizeof(stmt), NULL);

        if (strncmp(st, "struct ", 7) == 0)
        {
            // Skip struct definitions (already processed)
        }
        else if (strncmp(st, "fn ", 3) == 0)
        {
            // Skip function definitions (already processed)
        }
        else if (strncmp(st, "let ", 4) == 0)
        {
            // Variable declaration
            const char *p = st + 4;
            while (*p && isspace(*p))
                p++;

            // Check for 'mut'
            if (strncmp(p, "mut ", 4) == 0)
            {
                p += 4;
                while (*p && isspace(*p))
                    p++;
            }

            // Parse variable name
            char vname[32] = {0};
            p = compile_args_parse_identifier(p, vname, sizeof(vname));

            while (*p && isspace(*p))
                p++;

            // Parse optional type annotation
            char type_str[32] = {0};
            if (*p == ':')
            {
                p++;
                while (*p && isspace(*p))
                    p++;
                int32_t ti = 0;
                while (*p && *p != '=' && !isspace(*p) && ti < 31)
                {
                    type_str[ti++] = *p++;
                }
                type_str[ti] = '\0';
                while (*p && isspace(*p))
                    p++;
            }

            if (*p == '=')
            {
                p++;
                while (*p && isspace(*p))
                    p++;
            }

            // Generate C variable declaration
            int32_t vtype = 1;
            // Check if this variable was already marked as global
            int32_t is_global = 0;
            for (int32_t v = 0; v < var_count; v++)
            {
                if (strcmp(var_names[v], vname) == 0 && var_types[v] == -1)
                {
                    is_global = 1;
                    var_types[v] = 1; // Update to actual type (numeric)
                    break;
                }
            }

            // Infer struct type from initializer if no explicit type annotation
            if (type_str[0] == '\0')
            {
                // Check if value starts with a struct name followed by '{'
                const char *val_check = p;
                while (*val_check && isspace(*val_check))
                    val_check++;
                char potential_struct[32] = {0};
                int32_t pi = 0;
                while (*val_check && (isalnum(*val_check) || *val_check == '_') && pi < 31)
                    potential_struct[pi++] = *val_check++;
                potential_struct[pi] = '\0';
                while (*val_check && isspace(*val_check))
                    val_check++;
                if (*val_check == '{')
                {
                    // Looks like struct instantiation, check if it's a known struct
                    for (int32_t i = 0; i < struct_count; i++)
                    {
                        if (strcmp(potential_struct, structs[i].name) == 0)
                        {
                            strcpy_s(type_str, sizeof(type_str), potential_struct);
                            break;
                        }
                    }
                }
            }

            // Check if type is a struct
            int32_t struct_idx = -1;
            for (int32_t i = 0; i < struct_count; i++)
            {
                if (strcmp(type_str, structs[i].name) == 0)
                {
                    struct_idx = i;
                    break;
                }
            }

            if (struct_idx >= 0)
            {
                // Struct variable
                vtype = 4;
                if (!is_global)
                    compile_args_register_var(var_names, var_types, &var_count, vname, vtype);
                strcpy_s(var_struct_types[var_count - 1], sizeof(var_struct_types[var_count - 1]), type_str);

                // Parse struct instantiation: StructName { field1: value1, field2: value2, ... }
                // Skip to StructName
                while (*p && isspace(*p))
                    p++;

                // Skip struct name (should match type_str)
                while (*p && (isalnum(*p) || *p == '_'))
                    p++;

                // Skip to '{'
                while (*p && isspace(*p))
                    p++;
                if (*p == '{')
                    p++;

                // Generate C struct initialization
                char struct_init[512] = {0};
                snprintf(struct_init, sizeof(struct_init), "    %s %s = {", type_str, vname);
                strncat_s(c_code, sizeof(c_code), struct_init, _TRUNCATE);

                // Parse field initializations
                char field_values[10][128] = {{0}};
                int32_t field_indices[10] = {-1};
                int32_t init_count = 0;

                while (*p && *p != '}' && init_count < 10)
                {
                    while (*p && isspace(*p))
                        p++;
                    if (*p == '}')
                        break;

                    // Parse field name
                    char field_name[32] = {0};
                    const char *field_start = p;
                    p = compile_args_parse_identifier(p, field_name, sizeof(field_name));

                    // Skip ':'
                    while (*p && isspace(*p))
                        p++;
                    if (*p == ':')
                        p++;
                    while (*p && isspace(*p))
                        p++;

                    // Find field index in struct definition
                    int32_t field_idx = -1;
                    for (int32_t i = 0; i < structs[struct_idx].field_count; i++)
                    {
                        if (strcmp(field_name, structs[struct_idx].field_names[i]) == 0)
                        {
                            field_idx = i;
                            break;
                        }
                    }

                    // Parse field value (until ',' or '}')
                    const char *value_start = p;
                    int32_t depth = 0;
                    while (*p && !(*p == ',' && depth == 0) && !(*p == '}' && depth == 0))
                    {
                        if (*p == '{' || *p == '(')
                            depth++;
                        else if (*p == '}' || *p == ')')
                            depth--;
                        p++;
                    }

                    // Extract field value
                    size_t value_len = (size_t)(p - value_start);
                    if (value_len < sizeof(field_values[init_count]))
                    {
                        memcpy(field_values[init_count], value_start, value_len);
                        field_values[init_count][value_len] = '\0';
                        // Trim trailing whitespace
                        while (value_len > 0 && isspace(field_values[init_count][value_len - 1]))
                            field_values[init_count][--value_len] = '\0';

                        field_indices[init_count] = field_idx;
                        init_count++;
                    }

                    if (*p == ',')
                        p++;
                }

                // Generate field initializations in struct definition order
                for (int32_t i = 0; i < structs[struct_idx].field_count; i++)
                {
                    if (i > 0)
                        strncat_s(c_code, sizeof(c_code), ", ", _TRUNCATE);

                    // Find value for this field
                    int32_t found = 0;
                    for (int32_t j = 0; j < init_count; j++)
                    {
                        if (field_indices[j] == i)
                        {
                            compile_args_expression(field_values[j], c_code, sizeof(c_code), var_names, var_types, var_count);
                            found = 1;
                            break;
                        }
                    }

                    if (!found)
                    {
                        // Field not initialized, use 0
                        strncat_s(c_code, sizeof(c_code), "0", _TRUNCATE);
                    }
                }

                strncat_s(c_code, sizeof(c_code), "};\n", _TRUNCATE);
            }
            else if (strcmp(type_str, "*[*Str]") == 0 || strcmp(p, "__args__") == 0)
            {
                // Assigning __args__ directly (not __args__[n]) -> args slice
                vtype = 3;
                if (!is_global)
                    compile_args_register_var(var_names, var_types, &var_count, vname, vtype);
                else
                    var_types[var_count - 1] = vtype;
                compile_args_emit_args_slice_decl(c_code, sizeof(c_code), vname);
            }
            else if (strcmp(type_str, "*Str") == 0 || (strstr(p, "__args__[") != NULL && strstr(p, ".length") == NULL))
            {
                // String pointer from __args__[n] (without .length access)
                vtype = 2;
                if (!is_global)
                    compile_args_register_var(var_names, var_types, &var_count, vname, vtype);
                else
                    var_types[var_count - 1] = vtype;
                compile_args_emit_decl(c_code, sizeof(c_code), "char *", vname, p, var_names, var_types, var_count);
            }
            else
            {
                // Numeric type (USize, I32, etc.) or __args__[n].length
                vtype = 1;
                if (!is_global)
                    compile_args_register_var(var_names, var_types, &var_count, vname, vtype);
                else
                {
                    // For global variables, just emit assignment (no declaration)
                    emit_var_assignment(c_code, sizeof(c_code), vname, p, var_names, var_types, var_count);
                    // Update type in var_types
                    for (int32_t v = 0; v < var_count; v++)
                    {
                        if (strcmp(var_names[v], vname) == 0)
                        {
                            var_types[v] = vtype;
                            break;
                        }
                    }
                }
                if (!is_global)
                    compile_args_emit_decl(c_code, sizeof(c_code), "int32_t ", vname, p, var_names, var_types, var_count);
            }
        }
        else if (isalpha(*st) || *st == '_')
        {
            // Variable reassignment
            const char *p = st;
            char vname[32] = {0};
            p = compile_args_parse_identifier(p, vname, sizeof(vname));
            while (*p && isspace(*p))
                p++;

            if (*p == '=')
            {
                p++;
                while (*p && isspace(*p))
                    p++;

                emit_var_assignment(c_code, sizeof(c_code), vname, p, var_names, var_types, var_count);
            }
        }

        s = semi + 1;

        // Check for trailing expression
        const char *remaining = s;
        while (*remaining && isspace(*remaining))
            remaining++;
        if (*remaining && strchr(remaining, ';') == NULL)
        {
            strncat_s(c_code, sizeof(c_code), "    return ", _TRUNCATE);
            compile_args_expression_with_funcs(remaining, c_code, sizeof(c_code), var_names, var_types, var_count,
                                               functions, func_count);
            strncat_s(c_code, sizeof(c_code), ";\n", _TRUNCATE);
            break;
        }
    }

    strncat_s(c_code, sizeof(c_code), "}\n", _TRUNCATE);

    // Allocate and return
    char *out = (char *)malloc(strlen(c_code) + 1);
    if (!out)
        return (CompileResult){.code = NULL, .has_error = true, .error_message = "Memory allocation failed"};
    strcpy_s(out, strlen(c_code) + 1, c_code);
    return (CompileResult){.code = out, .has_error = false, .error_message = NULL};
}

CompileResult compile(const char *source)
{
    // If source contains __args__, use the transpiler to generate runtime C code
    if (source && strstr(source, "__args__") != NULL)
    {
        return compile_args_source(source);
    }

    // No __args__ - interpret the source and bake the constant result
    InterpretResult result = interpret(source);

    // If interpretation failed, return error result
    if (result.has_error)
        return (CompileResult){.code = NULL, .has_error = true, .error_message = result.error_message};

    // Generate a C program that returns the computed exit code
    // Mask to 0-255 range (unsigned byte) for valid exit codes on all platforms
    int32_t exit_code = result.value & 0xFF;

    return generate_c_program(
        "#include <stdlib.h>\n"
        "#include <stdint.h>\n"
        "int32_t main(int32_t argc, char **argv) { (void)argc; (void)argv; return %d; }\n",
        exit_code);
}
