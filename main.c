#include <stdio.h>
#include <string.h>

#include "eval.h"
#include "error.h"
#include "lexer.h"
#include "parser.h"

/* CLI entry: read source from argv[1] (or stdin), evaluate, print the
 * result value or a structured error. */

static int evaluate_source(const char *src, long *out)
{
    tuff_tok toks[TUFF_MAX_TOKENS];
    int n;
    tuff_error e = tuff_lex(src, toks, &n);
    if (e.code != ERR_OK)
    {
        printf("error at %d:%d: %s\n", e.pos.line, e.pos.col, tuff_err_msg(e.code));
        return 1;
    }
    tuff_program prog;
    e = tuff_parse(toks, n, &prog);
    if (e.code != ERR_OK)
    {
        printf("error at %d:%d: %s\n", e.pos.line, e.pos.col, tuff_err_msg(e.code));
        return 1;
    }
    tuff_result r = tuff_eval(&prog);
    if (!r.ok)
    {
        printf("error at %d:%d: %s\n", r.error.pos.line, r.error.pos.col,
               tuff_err_msg(r.error.code));
        return 1;
    }
    *out = r.value;
    return 0;
}

int main(int argc, char **argv)
{
    char buf[4096];
    const char *src;

    if (argc > 1)
    {
        src = argv[1];
    }
    else
    {
        if (fgets(buf, sizeof(buf), stdin) == NULL)
        {
            printf("error: no input\n");
            return 1;
        }
        size_t len = strlen(buf);
        if (len > 0 && buf[len - 1] == '\n')
            buf[len - 1] = '\0';
        src = buf;
    }

    long value;
    if (evaluate_source(src, &value) != 0)
        return 1;
    printf("%ld\n", value);
    return 0;
}