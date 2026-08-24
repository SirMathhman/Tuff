#ifndef TUFF_PARSER_H
#define TUFF_PARSER_H

#include "ast.h"
#include "lexer.h"

/* Parses toks (count tokens) into prog. Returns ERR_OK on success,
 * otherwise a structured error with the source position. */
tuff_error tuff_parse(const tuff_tok *toks, int count, tuff_program *prog);

#endif /* TUFF_PARSER_H */
