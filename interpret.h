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

// interpret_with_argc: Interpreter with argc and argv for __args__ support
// When argc is -1, __args__ is unavailable
// When argc >= 0, __args__ evaluates using argv values
// argv: Pointer to argv array (may be NULL if argc condition doesn't match)
InterpretResult interpret_with_argc(const char *str, int argc, const char *const *argv);

// compile: Compiler entry point.
// Takes Tuff source code and returns a CompileResult containing generated C source code.
// The generated C program handles __args__ access at runtime via its own main(argc, argv).
// If successful, caller owns the returned code string and must free() it.
// If has_error is true, code will be NULL and error_message contains the error.
CompileResult compile(const char *source);

RunResult run(const char *source, const char *const *args);

#endif
