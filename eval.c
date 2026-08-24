#include "eval.h"

#include <string.h>

typedef struct
{
    char name[TUFF_MAX_NAME];
    int is_mut;
    long value;
    int is_ref;  /* variable is a reference */
    int ref_mut; /* reference is &mut */
    int ref_idx; /* index of the referenced variable */
    tuff_pos pos;
} var;

static const var *find_var(const var *vars, int n, const char *name)
{
    for (int i = 0; i < n; i++)
        if (strcmp(vars[i].name, name) == 0)
            return &vars[i];
    return NULL;
}

/* Looks up name; on failure records ERR_UNDECLARED_VAR in r and returns NULL. */
static const var *find_var_or_err(const var *vars, int n, const char *name,
                                  tuff_pos pos, tuff_result *r)
{
    const var *v = find_var(vars, n, name);
    if (v == NULL)
    {
        r->error = tuff_err_at(ERR_UNDECLARED_VAR, pos);
        return NULL;
    }
    return v;
}

/* Reads the current value of a dereferenced reference; on failure records
 * an error in r and returns 0. */
static long deref_value(const var *vars, const var *v, tuff_pos pos,
                        tuff_result *r)
{
    if (!v->is_ref)
    {
        r->error = tuff_err_at(ERR_NOT_A_REF, pos);
        return 0;
    }
    return vars[v->ref_idx].value;
}

/* Evaluates a NODE_LET statement. On failure records the error in r and
 * returns the error code; on success returns ERR_OK. */
static tuff_err eval_let(var *vars, int *nvars, const tuff_node *nd,
                         tuff_result *r)
{
    if (find_var(vars, *nvars, nd->name) != NULL)
        return (r->error = tuff_err_at(ERR_DUPLICATE_VAR, nd->pos)).code;

    vars[*nvars].name[0] = '\0';
    memcpy(vars[*nvars].name, nd->name, strlen(nd->name) + 1);
    vars[*nvars].is_mut = nd->is_mut;
    vars[*nvars].value = nd->value;
    vars[*nvars].is_ref = 0;
    vars[*nvars].ref_mut = 0;
    vars[*nvars].ref_idx = -1;
    vars[*nvars].pos = nd->pos;
    if (nd->is_ref)
    {
        const var *ref = find_var(vars, *nvars, nd->ref_name);
        if (ref == NULL)
            return (r->error = tuff_err_at(ERR_UNDECLARED_VAR, nd->pos)).code;
        if (nd->ref_mut && !ref->is_mut)
            return (r->error = tuff_err_at(ERR_REF_NOT_MUT, nd->pos)).code;
        vars[*nvars].is_ref = 1;
        vars[*nvars].ref_mut = nd->ref_mut;
        vars[*nvars].ref_idx = (int)(ref - vars);
    }
    (*nvars)++;
    return ERR_OK;
}

/* Evaluates a NODE_ASSIGN statement. On failure records the error in r and
 * returns the error code; on success returns ERR_OK. */
static tuff_err eval_assign(var *vars, int nvars, const tuff_node *nd,
                            tuff_result *r)
{
    const var *v = find_var_or_err(vars, nvars, nd->name, nd->pos, r);
    if (v == NULL)
        return r->error.code;
    if (nd->deref)
    {
        if (!v->is_ref)
            return (r->error = tuff_err_at(ERR_NOT_A_REF, nd->pos)).code;
        if (!v->ref_mut)
            return (r->error = tuff_err_at(ERR_REF_NOT_MUT, nd->pos)).code;
        if (!vars[v->ref_idx].is_mut)
            return (r->error = tuff_err_at(ERR_ASSIGN_IMMUTABLE, nd->pos)).code;
        vars[v->ref_idx].value = nd->value;
    }
    else
    {
        if (v->is_ref)
            return (r->error = tuff_err_at(ERR_NOT_A_REF, nd->pos)).code;
        if (!v->is_mut)
            return (r->error = tuff_err_at(ERR_ASSIGN_IMMUTABLE, nd->pos)).code;
        for (int j = 0; j < nvars; j++)
            if (vars[j].name[0] != '\0' && strcmp(vars[j].name, nd->name) == 0)
                vars[j].value = nd->value;
    }
    return ERR_OK;
}

/* Resolves a binary operand to its value; on failure records the error in r
 * and returns 0. */
static long operand_value(const var *vars, int nvars, tuff_opknd kind,
                          long value, const char *name, tuff_pos pos,
                          tuff_result *r)
{
    if (kind == OPKND_LITERAL)
        return value;
    const var *v = find_var_or_err(vars, nvars, name, pos, r);
    if (v == NULL)
        return 0;
    return v->value;
}

/* Evaluates a NODE_RETURN statement. On success sets r->ok and r->value and
 * returns ERR_OK; on failure records the error in r and returns the code. */
static tuff_err eval_return(const var *vars, int nvars, const tuff_node *nd,
                            tuff_result *r)
{
    if (nd->binop)
    {
        long a = operand_value(vars, nvars, nd->op1_kind, nd->op1_value,
                               nd->op1_name, nd->pos, r);
        if (r->error.code != ERR_OK)
            return r->error.code;
        long b = operand_value(vars, nvars, nd->op2_kind, nd->op2_value,
                               nd->op2_name, nd->pos, r);
        if (r->error.code != ERR_OK)
            return r->error.code;
        r->value = (nd->op == TUFF_OP_OR) ? (a != 0 || b != 0) : 0;
        r->ok = 1;
        return ERR_OK;
    }
    if (nd->use_var)
    {
        const var *v = find_var_or_err(vars, nvars, nd->name, nd->pos, r);
        if (v == NULL)
            return r->error.code;
        if (nd->deref)
        {
            r->value = deref_value(vars, v, nd->pos, r);
            if (r->error.code != ERR_OK)
                return r->error.code;
        }
        else
        {
            if (v->is_ref)
                return (r->error = tuff_err_at(ERR_NOT_A_REF, nd->pos)).code;
            r->value = v->value;
        }
    }
    else
    {
        r->value = nd->value;
    }
    r->ok = 1;
    return ERR_OK;
}

tuff_result tuff_eval(const tuff_program *prog)
{
    tuff_result r;
    r.ok = 0;
    r.value = 0;
    r.error = tuff_err_at(ERR_OK, (tuff_pos){0, 0});

    var vars[TUFF_MAX_STMTS];
    int nvars = 0;

    for (int i = 0; i < prog->count; i++)
    {
        const tuff_node *nd = &prog->stmts[i];
        tuff_err code;
        if (nd->kind == NODE_LET)
            code = eval_let(vars, &nvars, nd, &r);
        else if (nd->kind == NODE_ASSIGN)
            code = eval_assign(vars, nvars, nd, &r);
        else if (nd->kind == NODE_RETURN)
        {
            code = eval_return(vars, nvars, nd, &r);
            return r;
        }
        else /* NODE_BLOCK */
        {
            /* No-op: a block's statements are flattened into program order,
             * so the main loop executes them in order. An inner return
             * terminates the program naturally, making everything after it
             * unreachable. */
            continue;
        }
        if (code != ERR_OK)
            return r;
    }

    r.error = tuff_err_at(ERR_EXPECTED_RETURN, (tuff_pos){0, 0});
    return r;
}
