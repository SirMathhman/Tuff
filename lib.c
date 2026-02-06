#include <stdlib.h>
#include <string.h>
#include <stdint.h>

int32_t is_pointer_type(int32_t type);

int32_t is_pointer_type(int32_t type) {
    return type != 0
    && type[0] == '*' 
    && type[1] != '\0';
}

int32_t main(int32_t argc, char **argv) {
    return fnis_mutable_pointer_type(pointer_type : *Str | 0):I32=>{if(pointer_type == 0 || pointer_type[0] != '*'){}}argv[1];
}
