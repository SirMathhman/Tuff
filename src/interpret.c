#include "interpret.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdlib.h>

int interpret(const char *s) {
    if (s == NULL) {
        return -1;
    }
    errno = 0;
    char *end = NULL;
    long val = strtol(s, &end, 10);
    /* No digits were found */
    if (end == s) {
        return -1;
    }
    /* Allow trailing whitespace only */
    while (*end != '\0' && isspace((unsigned char)*end)) {
        end++;
    }
    if (*end != '\0') {
        return -1;
    }
    /* Range/overflow check */
    if (errno == ERANGE || val < INT_MIN || val > INT_MAX) {
        return -1;
    }
    return (int)val;
}
