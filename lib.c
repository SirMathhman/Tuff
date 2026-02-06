#include <stdlib.h>
#include <string.h>
#include <stdint.h>

int is_pointer_type(char* type);

int is_pointer_type(char* type) {
    return type != 0
    && type[0] == '*' 
    && type[1] != '\0';
}

int32_t main(int32_t argc, char **argv) {
    return argv[1];
}
