#ifndef TUFF_PIPELINE_H
#define TUFF_PIPELINE_H

#include "error.h"

/* Result of running a Tuff program: on success ok is 1 and value holds the
 * return value; on failure ok is 0 and error holds the structured error. */
typedef struct
{
    int ok;
    long value;
    tuff_error error;
} tuff_run_result;

/* Runs the full lex -> parse -> eval pipeline on src. The token buffer is
 * internal; callers never see tuff_tok or TUFF_MAX_TOKENS. */
tuff_run_result tuff_run(const char *src);

#endif /* TUFF_PIPELINE_H */
