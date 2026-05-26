#define _CRT_SECURE_NO_WARNINGS

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <process.h>
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
static int execute_tuff(const char *input, const char *stdin_input);

/*
 * execute_tuff: compiles and runs Tuff source via Clang.
 *   1) Calls compile_tuff_to_c(input) to get generated C code.
 *   2) Writes the C code to a temp file.
 *   3) Compiles it with Clang (via _spawnvp with full LLVM path).
 *   4) Runs the resulting executable.
 *   5) Returns the process exit code, or -1 on failure.
 */
static int execute_tuff(const char *input, const char *stdin_input)
{
    const char *c_code = compile_tuff_to_c(input);
    if (c_code == NULL)
        return -1;

    /* Build unique temp file paths */
    char src_name[L_tmpnam + 3];
    char exe_name[L_tmpnam + 5];
    char stdin_name[L_tmpnam + 5];
    tmpnam(src_name);
    tmpnam(exe_name);
    tmpnam(stdin_name);
    strcat(src_name, ".c");
    strcat(exe_name, ".exe");
    strcat(stdin_name, ".txt");

    /* Write generated C source to temp file */
    FILE *f = fopen(src_name, "w");
    if (f == NULL)
        return -1;
    fprintf(f, "%s", c_code);
    fclose(f);

    /* Compile with clang using _spawnv with the 8.3 short path */
    const char *clang_path = "C:\\PROGRA~1\\LLVM\\bin\\clang.exe";
    const char *clang_args[] = {
        clang_path,
        src_name,
        "-o",
        exe_name,
        NULL};
    int comp_ret = _spawnv(_P_WAIT, clang_path, clang_args);
    if (comp_ret != 0)
    {
        remove(src_name);
        remove(exe_name);
        remove(stdin_name);
        return -1;
    }

    /* Write stdin_input to a temp file for redirection */
    FILE *sf = fopen(stdin_name, "w");
    if (sf == NULL)
    {
        remove(src_name);
        remove(exe_name);
        return -1;
    }
    fprintf(sf, "%s", stdin_input);
    fclose(sf);

    /*
     * Run the executable with stdin redirected from stdin_name.
     * Use cmd /c so the < redirection is interpreted by cmd.exe.
     */
    char cmd[1024];
    snprintf(cmd, sizeof(cmd),
             "cmd /c \"%s\" < \"%s\"",
             exe_name, stdin_name);
    int run_ret = system(cmd);

    /* Cleanup */
    remove(src_name);
    remove(exe_name);
    remove(stdin_name);

    return run_ret;
}

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
    int ret = execute_tuff("", "");
    printf("    (execute_tuff returned %d)\n", ret);
    TEST("execute_tuff(\"\") returns 0");
    ASSERT(ret == 0,
           "execute_tuff(\"\") should return 0");
    return 0;
}

static int test_execute_tuff_read_u8(void)
{
    int ret = execute_tuff("read<U8>()", "100");
    printf("    (execute_tuff returned %d)\n", ret);
    TEST("execute_tuff(\"read<U8>()\") with stdin \"100\" returns 100");
    ASSERT(ret == 100,
           "execute_tuff(\"read<U8>()\", \"100\") should return 100");
    return 0;
}

static int test_execute_tuff_read_u16(void)
{
    int ret = execute_tuff("read<U16>()", "100");
    printf("    (execute_tuff returned %d)\n", ret);
    TEST("execute_tuff(\"read<U16>()\") with stdin \"100\" returns 100");
    ASSERT(ret == 100,
           "execute_tuff(\"read<U16>()\", \"100\") should return 100");
    return 0;
}

static int test_execute_tuff_read_u16_extra(void)
{
    int ret = execute_tuff("read<U16>()", "100 20");
    printf("    (execute_tuff returned %d)\n", ret);
    TEST("execute_tuff(\"read<U16>()\") with stdin \"100 20\" returns 100");
    ASSERT(ret == 100,
           "execute_tuff(\"read<U16>()\", \"100 20\") should return 100");
    return 0;
}

static int test_compile_read_u7_error(void)
{
    TEST("compile(\"read<U7>()\") sets UnsupportedBitWidth error");
    clear_compile_error();
    const char *result = compile_tuff_to_c("read<U7>()");
    ASSERT(result == NULL, "compile_tuff_to_c should return NULL");
    ASSERT(has_compile_error() == true, "has_compile_error should be true");
    ASSERT(get_compile_error() == UnsupportedBitWidth,
           "error should be UnsupportedBitWidth");
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
    failed += test_execute_tuff_empty();
    failed += test_execute_tuff_read_u8();
    failed += test_execute_tuff_read_u16();
    failed += test_execute_tuff_read_u16_extra();
    failed += test_compile_read_u7_error();

    printf("\n%d / %d tests passed\n", tests_passed, tests_run);

    return failed > 0 ? 1 : 0;
}