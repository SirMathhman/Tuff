#include "parser.h"

#include <string.h>

typedef struct
{
    const tuff_tok *toks;
    int count;
    int i;
} pctx;

static const tuff_tok *cur(const pctx *c)
{
    return &c->toks[c->i];
}

static void advance(pctx *c)
{
    if (c->i < c->count)
        c->i++;
}

/* The token stream contains no whitespace tokens; the stream ends at TOK_EOF. */
static int has_more(const pctx *c)
{
    return c->i < c->count && c->toks[c->i].type != TOK_EOF;
}

static tuff_error expect(pctx *c, tuff_tok_type type)
{
    if (!has_more(c) || cur(c)->type != type)
        return tuff_err_at(ERR_EXPECTED_TOKEN, cur(c)->pos);
    advance(c);
    return tuff_err_at(ERR_OK, cur(c)->pos);
}

/* Parses an identifier into out and advances past it. */
static tuff_error copy_ident(pctx *c, char *out)
{
    if (cur(c)->type != TOK_IDENT)
        return tuff_err_at(ERR_EXPECTED_IDENT, cur(c)->pos);
    if (strlen(cur(c)->text) >= TUFF_MAX_NAME)
        return tuff_err_at(ERR_EXPECTED_IDENT, cur(c)->pos);
    memcpy(out, cur(c)->text, strlen(cur(c)->text) + 1);
    advance(c);
    return tuff_err_at(ERR_OK, cur(c)->pos);
}

/* Parses a value literal (int or bool) and stores it in *value. */
static tuff_error parse_value(pctx *c, long *value)
{
    if (!has_more(c))
        return tuff_err_at(ERR_EXPECTED_INT, cur(c)->pos);
    if (cur(c)->type == TOK_INT)
    {
        *value = cur(c)->value;
        advance(c);
        return tuff_err_at(ERR_OK, cur(c)->pos);
    }
    if (cur(c)->type == TOK_KEYWORD &&
        (cur(c)->kw == KW_TRUE || cur(c)->kw == KW_FALSE))
    {
        *value = (cur(c)->kw == KW_TRUE) ? 1 : 0;
        advance(c);
        return tuff_err_at(ERR_OK, cur(c)->pos);
    }
    return tuff_err_at(ERR_EXPECTED_INT, cur(c)->pos);
}

/* Parses `= <value> ;` and stores the value. */
static tuff_error parse_eq_value(pctx *c, long *value)
{
    tuff_error e = expect(c, TOK_EQ);
    if (e.code != ERR_OK)
        return e;
    e = parse_value(c, value);
    if (e.code != ERR_OK)
        return e;
    return expect(c, TOK_SEMI);
}

/* Parses `= & [mut] <ident> ;` and stores the referenced name and
 * mutability. */
static tuff_error parse_eq_ref(pctx *c, char *ref_name, int *ref_mut)
{
    tuff_error e = expect(c, TOK_EQ);
    if (e.code != ERR_OK)
        return e;
    if (!has_more(c) || cur(c)->type != TOK_AMP)
        return tuff_err_at(ERR_EXPECTED_TOKEN, cur(c)->pos);
    advance(c);
    *ref_mut = 0;
    if (has_more(c) && cur(c)->type == TOK_KEYWORD && cur(c)->kw == KW_MUT)
    {
        *ref_mut = 1;
        advance(c);
    }
    e = copy_ident(c, ref_name);
    if (e.code != ERR_OK)
        return e;
    return expect(c, TOK_SEMI);
}

static tuff_error parse_let(pctx *c, tuff_program *prog)
{
    tuff_node *nd = &prog->stmts[prog->count];
    memset(nd, 0, sizeof(*nd));
    nd->kind = NODE_LET;
    nd->pos = cur(c)->pos;

    advance(c); /* let */
    if (has_more(c) && cur(c)->type == TOK_KEYWORD && cur(c)->kw == KW_MUT)
    {
        nd->is_mut = 1;
        advance(c);
    }
    tuff_error e = copy_ident(c, nd->name);
    if (e.code != ERR_OK)
        return e;
    if (has_more(c) && cur(c)->type == TOK_EQ && c->i + 1 < c->count &&
        c->toks[c->i + 1].type == TOK_AMP)
    {
        nd->is_ref = 1;
        return parse_eq_ref(c, nd->ref_name, &nd->ref_mut);
    }
    return parse_eq_value(c, &nd->value);
}

static tuff_error parse_assign(pctx *c, tuff_program *prog)
{
    tuff_node *nd = &prog->stmts[prog->count];
    memset(nd, 0, sizeof(*nd));
    nd->kind = NODE_ASSIGN;
    nd->pos = cur(c)->pos;

    if (has_more(c) && cur(c)->type == TOK_STAR)
    {
        advance(c);
        nd->deref = 1;
        tuff_error e = copy_ident(c, nd->name);
        if (e.code != ERR_OK)
            return e;
        return parse_eq_value(c, &nd->value);
    }
    tuff_error e = copy_ident(c, nd->name);
    if (e.code != ERR_OK)
        return e;
    return parse_eq_value(c, &nd->value);
}

static tuff_error parse_return(pctx *c, tuff_program *prog)
{
    tuff_node *nd = &prog->stmts[prog->count];
    memset(nd, 0, sizeof(*nd));
    nd->kind = NODE_RETURN;
    nd->pos = cur(c)->pos;

    advance(c); /* return */
    if (has_more(c) && cur(c)->type == TOK_INT)
    {
        nd->value = cur(c)->value;
        advance(c);
    }
    else if (has_more(c) && cur(c)->type == TOK_KEYWORD &&
             (cur(c)->kw == KW_TRUE || cur(c)->kw == KW_FALSE))
    {
        nd->value = (cur(c)->kw == KW_TRUE) ? 1 : 0;
        advance(c);
    }
    else if (has_more(c) && cur(c)->type == TOK_STAR)
    {
        advance(c);
        nd->use_var = 1;
        nd->deref = 1;
        tuff_error e = copy_ident(c, nd->name);
        if (e.code != ERR_OK)
            return e;
    }
    else if (has_more(c) && cur(c)->type == TOK_IDENT)
    {
        nd->use_var = 1;
        tuff_error e = copy_ident(c, nd->name);
        if (e.code != ERR_OK)
            return e;
    }
    else
    {
        return tuff_err_at(ERR_EXPECTED_TOKEN, cur(c)->pos);
    }
    return expect(c, TOK_SEMI);
}

/* Parses `{ stmt* }` as a NODE_BLOCK. */
static tuff_error parse_block(pctx *c, tuff_program *prog);

/* Parses a single statement (let, assign, return, or block) into prog. */
static tuff_error parse_stmt(pctx *c, tuff_program *prog)
{
    if (prog->count >= TUFF_MAX_STMTS)
        return tuff_err_at(ERR_PROGRAM_TOO_LONG, cur(c)->pos);
    if (cur(c)->type == TOK_KEYWORD && cur(c)->kw == KW_LET)
    {
        return parse_let(c, prog);
    }
    else if (cur(c)->type == TOK_KEYWORD && cur(c)->kw == KW_RETURN)
    {
        if (prog->ret_idx != -1)
            return tuff_err_at(ERR_EXPECTED_TOKEN, cur(c)->pos);
        tuff_error e = parse_return(c, prog);
        if (e.code != ERR_OK)
            return e;
        prog->ret_idx = prog->count;
        return e;
    }
    else if (cur(c)->type == TOK_IDENT || cur(c)->type == TOK_STAR)
    {
        return parse_assign(c, prog);
    }
    else if (cur(c)->type == TOK_LBRACE)
    {
        return parse_block(c, prog);
    }
    else
    {
        return tuff_err_at(ERR_EXPECTED_TOKEN, cur(c)->pos);
    }
}

/* Parses `{ stmt* }` as a NODE_BLOCK. Statements are flattened into prog;
 * the block node records their range and any return inside. */
static tuff_error parse_block(pctx *c, tuff_program *prog)
{
    if (prog->count >= TUFF_MAX_STMTS)
        return tuff_err_at(ERR_PROGRAM_TOO_LONG, cur(c)->pos);
    tuff_node *nd = &prog->stmts[prog->count];
    memset(nd, 0, sizeof(*nd));
    nd->kind = NODE_BLOCK;
    nd->pos = cur(c)->pos;
    advance(c); /* { */
    nd->block_first = prog->count + 1;
    nd->block_ret = -1;
    while (has_more(c) && cur(c)->type != TOK_RBRACE)
    {
        tuff_error e = parse_stmt(c, prog);
        if (e.code != ERR_OK)
            return e;
        prog->count++;
        if (prog->stmts[prog->count - 1].kind == NODE_RETURN)
            nd->block_ret = prog->count - 1;
    }
    if (!has_more(c) || cur(c)->type != TOK_RBRACE)
        return tuff_err_at(ERR_EXPECTED_TOKEN, cur(c)->pos);
    advance(c); /* } */
    nd->block_count = prog->count - nd->block_first;
    return tuff_err_at(ERR_OK, cur(c)->pos);
}

tuff_error tuff_parse(const tuff_tok *toks, int count, tuff_program *prog)
{
    pctx c = {toks, count, 0};
    memset(prog, 0, sizeof(*prog));
    prog->ret_idx = -1;

    while (has_more(&c))
    {
        tuff_error e = parse_stmt(&c, prog);
        if (e.code != ERR_OK)
            return e;
        prog->count++;
    }

    if (prog->ret_idx == -1)
        return tuff_err_at(ERR_EXPECTED_RETURN, cur(&c)->pos);
    return tuff_err_at(ERR_OK, cur(&c)->pos);
}
