#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include "main.h"

int total_tests = 0;
int passed_tests = 0;

void assert_valid(char *test_name, char *source, char *std_in, int expected_exit_code)
{
    (void)std_in;
    total_tests += 1;

    compile(source);
    if (has_compile_error())
    {
        CompileError error = get_compile_error();
        printf("FAIL - %s: %s", test_name, error.message);
        return;
    }

    // Compile using clang
    // Run the generated .exe
    int actual_exit_code = -1;
    if (actual_exit_code == expected_exit_code)
    {
        passed_tests += 1;
    }
    else
    {
        printf("FAIL - %s: Expected exit code %d but was actually %d.", test_name, expected_exit_code, actual_exit_code);
    }
}

void assert_invalid(char *test_name, char *source)
{
    (void)test_name;
    total_tests += 1;
    if (has_compile_error())
    {
        passed_tests += 1;
    }
    else
    {
        printf("FAIL - %s", "Expected an error to be returned.");
    }
}

int main()
{
    // Test cases go here
    assert_valid("", "", "", 0);

    return 0;
}