#include "eval.h"

#include <string.h>

typedef struct
{
    char name[TUFF_MAX_NAME];
    int is_mut;
    long value;
    int is_ref;  /* variable is a reference */
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
        if (nd->kind == NODE_LET)
        {
            if (find_var(vars, nvars, nd->name) != NULL)
            {
                r.error = tuff_err_at(ERR_DUPLICATE_VAR, nd->pos);
                return r;
            }
            vars[nvars].name[0] = '\0';
            memcpy(vars[nvars].name, nd->name, strlen(nd->name) + 1);
            vars[nvars].is_mut = nd->is_mut;
            vars[nvars].value = nd->value;
            vars[nvars].is_ref = 0;
            vars[nvars].ref_idx = -1;
            vars[nvars].pos = nd->pos;
            if (nd->is_ref)
            {
                const var *ref = find_var(vars, nvars, nd->ref_name);
                if (ref == NULL)
                {
                    r.error = tuff_err_at(ERR_UNDECLARED_VAR, nd->pos);
                    return r;
                }
                vars[nvars].is_ref = 1;
                vars[nvars].ref_idx = (int)(ref - vars);
            }
            nvars++;
        }
        else if (nd->kind == NODE_ASSIGN)
        {
            const var *v = find_var(vars, nvars, nd->name);
            if (v == NULL)
            {
                r.error = tuff_err_at(ERR_UNDECLARED_VAR, nd->pos);
                return r;
            }
            if (v->is_ref)
            {
                r.error = tuff_err_at(ERR_NOT_A_REF, nd->pos);
                return r;
            }
            if (!v->is_mut)
            {
                r.error = tuff_err_at(ERR_ASSIGN_IMMUTABLE, nd->pos);
                return r;
            }
            for (int j = 0; j < nvars; j++)
                if (vars[j].name[0] != '\0' && strcmp(vars[j].name, nd->name) == 0)
                    vars[j].value = nd->value;
        }
        else if (nd->kind == NODE_RETURN)
        {
            if (nd->use_var)
            {
                const var *v = find_var(vars, nvars, nd->name);
                if (v == NULL)
                {
                    r.error = tuff_err_at(ERR_UNDECLARED_VAR, nd->pos);
                    return r;
                }
                if (nd->deref)
                {
                    if (!v->is_ref)
                    {
                        r.error = tuff_err_at(ERR_NOT_A_REF, nd->pos);
                        return r;
                    }
                    r.value = vars[v->ref_idx].value;
                }
                else
                {
                    if (v->is_ref)
                    {
                        r.error = tuff_err_at(ERR_NOT_A_REF, nd->pos);
                        return r;
                    }
                    r.value = v->value;
                }
            }
            else
            {
                r.value = nd->value;
            }
            r.ok = 1;
            return r;
        }
    }

    r.error = tuff_err_at(ERR_EXPECTED_RETURN, (tuff_pos){0, 0});
    return r;
}
