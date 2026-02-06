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

// interpret_with_argc: Interpreter with argc parameter for args.length support at compile time
// When argc is -1, args.length is treated as 0 (default behavior)
// When argc >= 0, args.length evaluates to argc - 1
InterpretResult interpret_with_argc(const char *str, int argc);

// compile: Compiler entry point with optional argc parameter.
// Takes Tuff source code and argc value, returns a CompileResult containing generated C source code.
// If successful, caller owns the returned code string and must free() it.
// If has_error is true, code will be NULL and error_message contains the error.
// argc: Should be set to the count of command-line arguments (including program name).
//       If argc is -1 (default), args.length evaluates to 0. If argc >= 0, args.length evaluates to argc - 1.
CompileResult compile(const char *source, int argc);

RunResult run(const char *source, const char *const *args);

#endif
