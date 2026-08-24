#include "pipeline.h"

#include "eval.h"
#include "lexer.h"
#include "parser.h"

tuff_run_result tuff_run(const char *src)
{
    tuff_run_result r;
    r.ok = 0;
    r.value = 0;
    r.error = tuff_err_at(ERR_OK, (tuff_pos){0, 0});

    tuff_tok toks[TUFF_MAX_TOKENS];
    int n;
    tuff_error e = tuff_lex(src, toks, &n);
    if (e.code != ERR_OK)
    {
        r.error = e;
        return r;
    }
    tuff_program prog;
    e = tuff_parse(toks, n, &prog);
    if (e.code != ERR_OK)
    {
        r.error = e;
        return r;
    }
    tuff_result res = tuff_eval(&prog);
    r.ok = res.ok;
    r.value = res.value;
    r.error = res.error;
    return r;
}
