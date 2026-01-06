#ifndef TUFF_PARSER_H
#define TUFF_PARSER_H

#include <stddef.h>

void skip_ws(const char **ptr);
int parse_number(const char **ptr, long *out_val);
int parse_identifier(const char **ptr, char *out, size_t out_len);
int parse_expr(const char **ptr, long long *out_val);
int match_literal(const char **ptr, const char *lit, int require_word_boundary);
int parse_type(const char **ptr, int *out_type);

/* Check whether the text range [start,end) is a boolean expression (only boolean
 * operators/literals/identifiers) This is used for type validation of Bool RHS and for
 * if-branch/condition validation.
 */
int is_boolean_expr(const char *start, const char *end);

#endif /* TUFF_PARSER_H */
