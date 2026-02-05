#include "interpret.h"
#include <stdlib.h>

int interpret(const char *str)
{
    if (str == NULL || *str == '\0')
    {
        return 0;
    }
    return (int)strtol(str, NULL, 10);
}
