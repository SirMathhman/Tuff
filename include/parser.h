#ifndef TUFF_PARSER_H
#define TUFF_PARSER_H

#include <stddef.h>

void skip_ws(const char **ptr);
int parse_number(const char **ptr, long *out_val);
int parse_identifier(const char **ptr, char *out, size_t out_len);
int parse_expr(const char **ptr, long long *out_val);
int match_literal(const char **ptr, const char *lit, int require_word_boundary);
int parse_type(const char **ptr, int *out_type);

#endif /* TUFF_PARSER_H */
