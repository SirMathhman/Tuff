#ifndef TUFF_LEXER_H
#define TUFF_LEXER_H

#include "error.h"

typedef enum
{
    TOK_EOF = 0,
    TOK_KEYWORD, /* .kw is one of KW_* */
    TOK_IDENT,
    TOK_INT,
    TOK_EQ,  /* = */
    TOK_SEMI /* ; */
} tuff_tok_type;

typedef enum
{
    KW_NONE = 0,
    KW_LET,
    KW_MUT,
    KW_RETURN
} tuff_kw;

typedef struct
{
    tuff_tok_type type;
    tuff_kw kw;
    char text[64];
    long value;
    tuff_pos pos;
} tuff_tok;

#define TUFF_MAX_TOKENS 256

/* Tokenizes src into toks (up to TUFF_MAX_TOKENS). Returns the token count,
 * or -1 if the token buffer is too small. */
int tuff_lex(const char *src, tuff_tok *toks);

#endif /* TUFF_LEXER_H */
