#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "main.h"

int total_tests = 0;
int passed_tests = 0;

void assert_valid(char *test_name, char *source, char *std_in, int expected_exit_code)
{
    // (std_in is used below when running the exe)
    total_tests += 1;

    char *generated = compile(source);
    if (has_compile_error())
    {
        CompileError error = get_compile_error();
        printf("FAIL - %s: %s\n", test_name, error.message);
        return;
    }

    // Write generated code to a temp file
    FILE *f = fopen("temp_gen.c", "w");
    fprintf(f, "%s", generated);
    fclose(f);

    // Compile using clang
    char cmd[512];
    sprintf(cmd, "clang -o temp_gen.exe temp_gen.c 2>compile_err.txt");
    int ret = system(cmd);
    if (ret != 0)
    {
        printf("FAIL - %s: Failed to compile generated code.\n", test_name);
        return;
    }

    // Write stdin to a temp file if provided
    FILE *stdin_file = fopen("temp_stdin.txt", "w");
    fprintf(stdin_file, "%s", std_in);
    fclose(stdin_file);

    // Run the generated .exe and capture exit code (pipe stdin from file)
    sprintf(cmd, ".\\temp_gen.exe < temp_stdin.txt");
    int raw_status = system(cmd);
    int actual_exit_code = (raw_status >= 0 && raw_status <= 255) ? raw_status : (raw_status >> 8);
    if (actual_exit_code == expected_exit_code)
    {
        passed_tests += 1;
    }
    else
    {
        printf("FAIL - %s: Expected exit code %d but was actually %d.\n", test_name, expected_exit_code, actual_exit_code);
    }
}

void assert_invalid(char *test_name, char *source)
{
    (void)test_name;
    compile(source);

    total_tests += 1;
    if (has_compile_error())
    {
        passed_tests += 1;
    }
    else
    {
        printf("FAIL - %s: Expected an error to be returned.\n", test_name);
    }
}

int main()
{
    // Test cases go here
    assert_valid("empty source", "", "", 0);
    assert_valid("returns 100", "100", "", 100);
    assert_valid("read from stdin", "read()", "100", 100);
    assert_valid("read first int only", "read()", "100 20", 100);

    printf("Total tests: %d\n", total_tests);
    printf("Passed tests: %d\n", passed_tests);

    if (passed_tests != total_tests)
    {
        return 2;
    }

    return 0;
}