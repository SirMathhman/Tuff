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

InterpretResult interpret(const char *str)
{
    if (str == NULL || *str == '\0')
    {
        return (InterpretResult){.value = 0, .has_error = false, .error_message = NULL};
    }

    // Check if the string starts with a negative sign
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
