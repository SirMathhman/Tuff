#include "lexer.h"

#include <ctype.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>

static int is_space(char c)
{
    return c == ' ' || c == '\t';
}

static tuff_kw keyword_for(const char *text, size_t len)
{
    if (len == 3 && strncmp(text, "let", 3) == 0)
        return KW_LET;
    if (len == 3 && strncmp(text, "mut", 3) == 0)
        return KW_MUT;
    if (len == 6 && strncmp(text, "return", 6) == 0)
        return KW_RETURN;
    return KW_NONE;
}

typedef int (*char_pred)(unsigned char);

static int is_word_char(unsigned char c)
{
    return isalnum(c) || c == '_';
}

static int is_digit_char(unsigned char c)
{
    return isdigit(c);
}

/* Scans a run of characters matching pred, stores it in tok->text, and
 * advances p/col. Returns ERR_OK on success, ERR_NAME_TOO_LONG if the run
 * is empty or too long. */
static tuff_err scan_run(const char **pp, int *colp, tuff_tok *tok, char_pred pred)
{
    const char *p = *pp;
    const char *start = p;
    while (pred((unsigned char)*p))
    {
        p++;
        (*colp)++;
    }
    size_t len = (size_t)(p - start);
    if (len == 0 || len >= sizeof(tok->text))
        return ERR_NAME_TOO_LONG;
    memcpy(tok->text, start, len);
    tok->text[len] = '\0';
    *pp = p;
    return ERR_OK;
}

tuff_error tuff_lex(const char *src, tuff_tok *toks, int *count)
{
    int n = 0;
    int line = 1;
    int col = 1;
    const char *p = src;

    while (*p != '\0')
    {
        if (n >= TUFF_MAX_TOKENS)
            return tuff_err_at(ERR_SOURCE_TOO_LONG, (tuff_pos){line, col});
        if (is_space(*p))
        {
            p++;
            col++;
            continue;
        }
        if (*p == '\n')
        {
            p++;
            line++;
            col = 1;
            continue;
        }
        if (*p == '=' || *p == ';' || *p == '&' || *p == '*')
        {
            tuff_tok_type type;
            if (*p == '=')
                type = TOK_EQ;
            else if (*p == ';')
                type = TOK_SEMI;
            else if (*p == '&')
                type = TOK_AMP;
            else
                type = TOK_STAR;
            toks[n].type = type;
            toks[n].pos.line = line;
            toks[n].pos.col = col;
            n++;
            p++;
            col++;
            continue;
        }
        if (isalpha((unsigned char)*p) || *p == '_')
        {
            int start_col = col;
            tuff_err err = scan_run(&p, &col, &toks[n], is_word_char);
            if (err != ERR_OK)
                return tuff_err_at(err, (tuff_pos){line, start_col});
            size_t len = strlen(toks[n].text);
            toks[n].kw = keyword_for(toks[n].text, len);
            toks[n].type = toks[n].kw != KW_NONE ? TOK_KEYWORD : TOK_IDENT;
            toks[n].pos.line = line;
            toks[n].pos.col = col - (int)len;
            n++;
            continue;
        }
        if (isdigit((unsigned char)*p))
        {
            int start_col = col;
            tuff_err err = scan_run(&p, &col, &toks[n], is_digit_char);
            if (err != ERR_OK)
                return tuff_err_at(err, (tuff_pos){line, start_col});
            errno = 0;
            long v = strtol(toks[n].text, NULL, 10);
            if (errno == ERANGE)
                return tuff_err_at(ERR_INT_OVERFLOW, (tuff_pos){line, start_col});
            toks[n].type = TOK_INT;
            toks[n].value = v;
            toks[n].pos.line = line;
            toks[n].pos.col = col - (int)strlen(toks[n].text);
            n++;
            continue;
        }
        return tuff_err_at(ERR_UNRECOGNIZED_CHAR, (tuff_pos){line, col});
    }

    if (n >= TUFF_MAX_TOKENS)
        return tuff_err_at(ERR_SOURCE_TOO_LONG, (tuff_pos){line, col});
    toks[n].type = TOK_EOF;
    toks[n].pos.line = line;
    toks[n].pos.col = col;
    n++;
    *count = n;
    return tuff_err_at(ERR_OK, (tuff_pos){line, col});
}
