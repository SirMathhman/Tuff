#include <stdio.h>
#include <string.h>
#include "../src/greet.h"

static int tests_run = 0;
static int tests_passed = 0;

#define TEST(name)                      \
    do                                  \
    {                                   \
        tests_run++;                    \
        printf("  TEST %s ... ", name); \
    } while (0)

#define ASSERT(cond, msg)              \
    do                                 \
    {                                  \
        if (!(cond))                   \
        {                              \
            printf("FAIL: %s\n", msg); \
            return 1;                  \
        }                              \
        tests_passed++;                \
        printf("ok\n");                \
    } while (0)

static int test_greet_returns_string(void)
{
    TEST("greet returns non-NULL");
    ASSERT(greet() != NULL, "greet() returned NULL");
    return 0;
}

static int test_greet_contains_hello(void)
{
    TEST("greet contains 'Hello'");
    ASSERT(strstr(greet(), "Hello") != NULL,
           "greet() should contain 'Hello'");
    return 0;
}

static int test_greet_contains_tuff(void)
{
    TEST("greet contains 'Tuff'");
    ASSERT(strstr(greet(), "Tuff") != NULL,
           "greet() should contain 'Tuff'");
    return 0;
}

int main(void)
{
    int failed = 0;

    printf("greet tests\n");
    printf("-----------\n");

    failed += test_greet_returns_string();
    failed += test_greet_contains_hello();
    failed += test_greet_contains_tuff();

    printf("\n%d / %d tests passed\n", tests_passed, tests_run);

    return failed > 0 ? 1 : 0;
}