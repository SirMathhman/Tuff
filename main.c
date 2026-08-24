#include <stdio.h>
#include <string.h>
#include <stdlib.h>

int evaluate_tuff(const char *s)
{
    const char *p = s;
    while (*p == ' ' || *p == '\t') p++;
    if (strncmp(p, "return", 6) != 0) return 0;
    p += 6;
    while (*p == ' ' || *p == '\t') p++;
    char *end;
    long v = strtol(p, &end, 10);
    while (*end == ' ' || *end == '\t') end++;
    if (*end != ';') return 0;
    end++;
    while (*end == ' ' || *end == '\t') end++;
    if (*end != '\0') return 0;
    return (int)v;
}

int main()
{
    int failures = 0;

    if (evaluate_tuff("") != 0)
    {
        printf("FAIL: evaluate_tuff(\"\") => %d, expected 0\n", evaluate_tuff(""));
        failures++;
    }

    if (evaluate_tuff("return 1;") != 1)
    {
        printf("FAIL: evaluate_tuff(\"return 1;\") => %d, expected 1\n", evaluate_tuff("return 1;"));
        failures++;
    }

    if (failures == 0)
        printf("All tests passed\n");

    return failures != 0;
}