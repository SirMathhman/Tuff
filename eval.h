#ifndef TUFF_EVAL_H
#define TUFF_EVAL_H

#include "ast.h"
#include "error.h"

typedef struct
{
    int ok;
    long value;
    tuff_error error;
} tuff_result;

/* Tree-walk evaluation. Success and error are distinguishable:
 * a program that returns 0 is a success, not an error. */
tuff_result tuff_eval(const tuff_program *prog);

#endif /* TUFF_EVAL_H */
