#include <stdio.h>
#include <string.h>

int evaluate_tuff(const char *s)
{
    (void)s;
    return 0;
}

int main()
{
    int failures = 0;

    if (evaluate_tuff("") != 0)
    {
        printf("FAIL: evaluate_tuff(\"\") => %d, expected 0\n", evaluate_tuff(""));
        failures++;
    }

    if (failures == 0)
        printf("All tests passed\n");

    return failures != 0;
}