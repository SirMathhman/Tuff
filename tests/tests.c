#include <stdio.h>
#include <string.h>

#include "../eval.h"
#include "../error.h"
#include "../lexer.h"
#include "../parser.h"

static int failures = 0;

/* Evaluates src; returns 1 if it succeeds with the expected value. */
static int check_ok(const char *src, long expected)
{
    tuff_tok toks[TUFF_MAX_TOKENS];
    int n = tuff_lex(src, toks);
    if (n < 0)
    {
        printf("FAIL: %s => lex error, expected %ld\n", src, expected);
        failures++;
        return 0;
    }
    tuff_program prog;
    tuff_error e = tuff_parse(toks, n, &prog);
    if (e.code != ERR_OK)
    {
        printf("FAIL: %s => parse error (%s), expected %ld\n", src,
               tuff_err_msg(e.code), expected);
        failures++;
        return 0;
    }
    tuff_result r = tuff_eval(&prog);
    if (!r.ok || r.value != expected)
    {
        printf("FAIL: %s => %s, expected %ld\n", src,
               r.ok ? "wrong value" : "eval error", expected);
        failures++;
        return 0;
    }
    return 1;
}

/* Evaluates src; returns 1 if it fails with the expected error code. */
static int check_err(const char *src, tuff_err expected)
{
    tuff_tok toks[TUFF_MAX_TOKENS];
    int n = tuff_lex(src, toks);
    if (n < 0)
        return 1; /* lex failure counts as an error */
    tuff_program prog;
    tuff_error e = tuff_parse(toks, n, &prog);
    if (e.code == ERR_OK)
    {
        tuff_result r = tuff_eval(&prog);
        if (r.ok)
        {
            printf("FAIL: %s => ok (%ld), expected error %s\n", src, r.value,
                   tuff_err_msg(expected));
            failures++;
            return 0;
        }
        e = r.error;
    }
    if (e.code != expected)
    {
        printf("FAIL: %s => error %s, expected %s\n", src, tuff_err_msg(e.code),
               tuff_err_msg(expected));
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

    if (failures == 0)
        printf("All tests passed\n");
    return failures != 0;
}
