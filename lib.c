#include <stdlib.h>
#include <string.h>

typedef struct {
    char* suffix;
    int min_value;
    int max_value;
    char* error_message;
} TypeInfo;

typedef struct {
    int name;
    int value;
} Variable;

typedef struct {
    int x;
} Wrapper;


int main(int argc, char **argv) {
    char *length = argv[1];
    Wrapper temp = {length};
    return temp.x;
}
