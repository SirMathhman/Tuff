#include <stdlib.h>
#include <string.h>
#include <stdint.h>

typedef struct {
    char* suffix;
    int min_value;
    int max_value;
    char* error_message;
} TypeInfo;

typedef struct {
    char name[32];
    int value;
    char type[16];
    int is_mutable;
    int is_array;
} Variable;

typedef struct {
    char name[32];
} FunctionInfo;

typedef struct {
    char name[32];
} StructInfo;

typedef struct {
    char* input;
} Parser;

typedef struct {
    int value;
} NumberValue;

// Global argc/argv for __args__ access
int32_t __tuff_argc = 0;
char **__tuff_argv = NULL;

int32_t main(int32_t argc, char **argv) {
    __tuff_argc = argc;
    __tuff_argv = argv;
    int32_t MAX_ARRAY_ELEMENTS = 64;
    TypeInfo *TypeInfo = NULL;
    return (int)strlen(__tuff_argv[1]);
}
