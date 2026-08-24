#include <stdio.h>
#include <string.h>

#include "../error.h"
#include "../pipeline.h"

static int failures = 0;

/* Evaluates src; returns 1 if it succeeds with the expected value. */
static int check_ok(const char *src, long expected)
{
    tuff_run_result r = tuff_run(src);
    if (!r.ok || r.value != expected)
    {
        printf("FAIL: %s => %s, expected %ld\n", src,
               r.ok ? "wrong value" : tuff_err_msg(r.error.code), expected);
        failures++;
        return 0;
    }
    return 1;
}

/* Evaluates src; returns 1 if it fails with the expected error code. */
static int check_err(const char *src, tuff_err expected)
{
    tuff_run_result r = tuff_run(src);
    if (r.ok)
    {
        printf("FAIL: %s => ok (%ld), expected error %s\n", src, r.value,
               tuff_err_msg(expected));
        failures++;
        return 0;
    }
    if (r.error.code != expected)
    {
        printf("FAIL: %s => error %s, expected %s\n", src,
               tuff_err_msg(r.error.code), tuff_err_msg(expected));
        failures++;
        return 0;
    }
    return 1;
}

int main(void)
{
    check_ok("return 1;", 1);
    check_ok("let x = 1; return x;", 1);
    check_ok("let mut x = 0; x = 1; return x;", 1);
    check_ok("let x = 1; let y = &x; return *y;", 1);
    check_ok("let mut x = 0; let y = &mut x; *y = 1; return x;", 1);
    check_ok("let mut x = 0; { x = 1; } return x;", 1);
    check_ok("let mut x = 0; { x = 1; return x; }", 1);
    /* Statements after a block that returns are unreachable. */
    check_ok("let mut x = 0; { x = 1; return x; } x = 2;", 1);
    check_ok("let x = true; return x;", 1);
    check_ok("return true;", 1);
    check_ok("let x = false; return x;", 0);
    check_ok("let x = true; let y = false; return x || y;", 1);
    check_ok("let x = false; let y = false; return x || y;", 0);
    check_ok("let x = true; let y = false; return x && y;", 0);
    check_ok("let x = true; let y = true; return x && y;", 1);
    check_ok("let x = 0; let y = 1; return x == y;", 0);
    check_ok("let x = 2; let y = 2; return x == y;", 1);

    /* A program that returns 0 is a success, not an error. */
    check_ok("return 0;", 0);

    /* Structured errors. */
    check_err("", ERR_EXPECTED_RETURN);
    check_err("let x = 1;", ERR_EXPECTED_RETURN);
    check_err("let x = 1; let x = 2; return x;", ERR_DUPLICATE_VAR);
    check_err("x = 1; return x;", ERR_UNDECLARED_VAR);
    check_err("let x = 1; x = 2; return x;", ERR_ASSIGN_IMMUTABLE);
    check_err("let x = 1; return y;", ERR_UNDECLARED_VAR);
    check_err("let x = a; return x;", ERR_EXPECTED_INT);
    check_err("let x = 1; let y = &mut x; return *y;", ERR_REF_NOT_MUT);
    check_err("let x = 1; let y = &x; *y = 2; return x;", ERR_REF_NOT_MUT);

    /* Lexer errors. */
    check_err("return @;", ERR_UNRECOGNIZED_CHAR);
    check_err("let x = 99999999999999999999999999; return x;", ERR_INT_OVERFLOW);
    check_err("let aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa = 1; return x;",
              ERR_NAME_TOO_LONG);
    char long_src[1024];
    for (int i = 0; i < 300; i++)
        sprintf(long_src + i * 2, "1 ");
    check_err(long_src, ERR_SOURCE_TOO_LONG);

    if (failures == 0)
        printf("All tests passed\n");
    return failures != 0;
}
