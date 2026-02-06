#ifndef INTERPRET_H
#define INTERPRET_H

#include <stdbool.h>

typedef struct
{
    int value;
    bool has_error;
    const char *error_message;
} InterpretResult;

typedef struct
{
    char *code;
    bool has_error;
    const char *error_message;
} CompileResult;

typedef struct
{
    int exit_code;
    bool has_error;
    const char *error_message;
} RunResult;

InterpretResult interpret(const char *str);

// compile: Compiler entry point.
// Takes Tuff source code and returns a CompileResult containing generated C source code.
// If successful, caller owns the returned code string and must free() it.
// If has_error is true, code will be NULL and error_message contains the error.
CompileResult compile(const char *source);

RunResult run(const char *source, const char *const *args);

#endif
