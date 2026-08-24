#include <stdio.h>
#include <string.h>
#include <stdlib.h>

int evaluate_tuff(const char *s)
{
    const char *p = s;
    while (*p == ' ' || *p == '\t')
        p++;

    int hasVar = 0;
    int hasMut = 0;
    char varName[64];
    size_t varNameLen = 0;
    long varVal = 0;

    if (strncmp(p, "let", 3) == 0 && (p[3] == ' ' || p[3] == '\t'))
    {
        p += 3;
        while (*p == ' ' || *p == '\t')
            p++;
        if (strncmp(p, "mut", 3) == 0 && (p[3] == ' ' || p[3] == '\t'))
        {
            p += 3;
            while (*p == ' ' || *p == '\t')
                p++;
            hasMut = 1;
        }
        const char *name = p;
        while (*p != ' ' && *p != '\t' && *p != '=')
            p++;
        varNameLen = (size_t)(p - name);
        if (varNameLen == 0 || varNameLen >= sizeof(varName))
            return 0;
        memcpy(varName, name, varNameLen);
        while (*p == ' ' || *p == '\t')
            p++;
        if (*p != '=')
            return 0;
        p++;
        while (*p == ' ' || *p == '\t')
            p++;
        char *end;
        varVal = strtol(p, &end, 10);
        while (*end == ' ' || *end == '\t')
            end++;
        if (*end != ';')
            return 0;
        p = end + 1;
        while (*p == ' ' || *p == '\t')
            p++;
        hasVar = 1;
    }

    while (hasVar && hasMut)
    {
        const char *q = p;
        while (*q != ' ' && *q != '\t' && *q != ';')
            q++;
        size_t nLen = (size_t)(q - p);
        if (nLen != varNameLen || strncmp(p, varName, nLen) != 0)
            break;
        q++;
        while (*q == ' ' || *q == '\t')
            q++;
        if (*q != '=')
            break;
        q++;
        while (*q == ' ' || *q == '\t')
            q++;
        char *end;
        long nv = strtol(q, &end, 10);
        while (*end == ' ' || *end == '\t')
            end++;
        if (*end != ';')
            break;
        varVal = nv;
        p = end + 1;
        while (*p == ' ' || *p == '\t')
            p++;
    }

    if (strncmp(p, "return", 6) != 0)
        return 0;
    p += 6;
    while (*p == ' ' || *p == '\t')
        p++;

    long v;
    if (*p >= '0' && *p <= '9')
    {
        char *end;
        v = strtol(p, &end, 10);
        while (*end == ' ' || *end == '\t')
            end++;
        if (*end != ';')
            return 0;
        end++;
        while (*end == ' ' || *end == '\t')
            end++;
        if (*end != '\0')
            return 0;
    }
    else
    {
        const char *name = p;
        while (*name != ' ' && *name != '\t' && *name != ';')
            name++;
        size_t nameLen = (size_t)(name - p);
        if (!hasVar || nameLen != varNameLen || strncmp(p, varName, nameLen) != 0)
            return 0;
        if (p[nameLen] != ';')
            return 0;
        name += 1;
        while (*name == ' ' || *name == '\t')
            name++;
        if (*name != '\0')
            return 0;
        v = varVal;
    }
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

    if (evaluate_tuff("let x = 1; return x;") != 1)
    {
        printf("FAIL: evaluate_tuff(\"let x = 1; return x;\") => %d, expected 1\n", evaluate_tuff("let x = 1; return x;"));
        failures++;
    }

    if (evaluate_tuff("let mut x = 0; x = 1; return x;") != 1)
    {
        printf("FAIL: evaluate_tuff(\"let mut x = 0; x = 1; return x;\") => %d, expected 1\n", evaluate_tuff("let mut x = 0; x = 1; return x;"));
        failures++;
    }

    if (failures == 0)
        printf("All tests passed\n");

    return failures != 0;
}