#include "interpret.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

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

    // Check for unsigned type suffix
    bool has_unsigned_suffix = (suffix_start[0] != '\0') &&
                               (strncmp(suffix_start, "U8", 2) == 0 ||
                                strncmp(suffix_start, "U16", 3) == 0 ||
                                strncmp(suffix_start, "U32", 3) == 0 ||
                                strncmp(suffix_start, "U64", 3) == 0);

    // Error: negative value with unsigned type suffix
    if (is_negative && has_unsigned_suffix)
    {
        return (InterpretResult){
            .value = 0,
            .has_error = true,
            .error_message = "Cannot parse negative value as unsigned type"};
    }

    // Parse the numeric part
    int value = (int)strtol(str, NULL, 10);
    return (InterpretResult){.value = value, .has_error = false, .error_message = NULL};
}
