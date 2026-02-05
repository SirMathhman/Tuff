#ifndef INTERPRET_H
#define INTERPRET_H

#include <stdbool.h>

typedef struct
{
    int value;
    bool has_error;
    const char *error_message;
} InterpretResult;

InterpretResult interpret(const char *str);

#endif
