#define _CRT_SECURE_NO_WARNINGS

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "../src/greet.h"
#include "../src/compile.h"

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

/* Forward declarations */
static int execute_tuff(const char *input);

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

static int test_execute_tuff_empty(void)
{
    TEST("execute_tuff(\"\") returns 0");
    ASSERT(execute_tuff("") == 0,
           "execute_tuff(\"\") should return 0");
    return 0;
}

/*
 * execute_tuff: compiles and runs Tuff source via Clang.
 *   1) Calls compile_tuff_to_c(input) to get generated C code.
 *   2) Writes the C code to a temp file.
 *   3) Compiles it with Clang.
 *   4) Runs the resulting executable.
 *   5) Returns the process exit code, or -1 on failure.
 */
static int execute_tuff(const char *input)
{
    const char *c_code = compile_tuff_to_c(input);
    if (c_code == NULL)
        return -1;

    /* Create unique temp file names */
    char src_name[L_tmpnam + 3];
    char exe_name[L_tmpnam + 5];
    tmpnam(src_name);
    tmpnam(exe_name);
    strcat(src_name, ".c");
    strcat(exe_name, ".exe");

    /* Write generated C source to temp file */
    FILE *f = fopen(src_name, "w");
    if (f == NULL)
        return -1;
    fprintf(f, "%s", c_code);
    fclose(f);

    /* Compile with Clang */
    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "clang \"%s\" -o \"%s\" 2>nul", src_name, exe_name);
    int comp_ret = system(cmd);
    if (comp_ret != 0)
    {
        remove(src_name);
        return -1;
    }

    /* Run the compiled executable */
    snprintf(cmd, sizeof(cmd), "\"%s\"", exe_name);
    int run_ret = system(cmd);

    /* Cleanup */
    remove(src_name);
    remove(exe_name);

    return run_ret;
}

int main(void)
{
    int failed = 0;

    printf("greet tests\n");
    printf("-----------\n");

    failed += test_greet_returns_string();
    failed += test_greet_contains_hello();
    failed += test_greet_contains_tuff();
    failed += test_execute_tuff_empty();

    printf("\n%d / %d tests passed\n", tests_passed, tests_run);

    return failed > 0 ? 1 : 0;
}