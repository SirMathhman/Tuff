#include "parser.h"
#include "symbols.h"

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>

#define STRTO_BASE 10

void skip_ws(const char **ptr) {
	while (**ptr != '\0' && isspace((unsigned char)**ptr))
		(*ptr)++;
}

/* parse a long from string */
int parse_long(const char *str, long *out_val, const char **endptr) {
	errno = 0;
	char *end = NULL;
	long val = strtol(str, &end, STRTO_BASE);
	if (end == str) return 0;
	*out_val = val;
	if (endptr) *endptr = end;
	return 1;
}

int parse_number(const char **ptr, long *out_val) {
	const char *end = NULL;
	if (!parse_long(*ptr, out_val, &end)) return 0;
	*ptr = end;
	return 1;
}

int parse_identifier(const char **ptr, char *out, size_t out_len) {
	const char *cursor = *ptr;
	if (!((*cursor >= 'A' && *cursor <= 'Z') || (*cursor >= 'a' && *cursor <= 'z') ||
	      *cursor == '_'))
		return 0;
	size_t idx = 0;
	while ((*cursor >= 'A' && *cursor <= 'Z') || (*cursor >= 'a' && *cursor <= 'z') ||
	       (*cursor >= '0' && *cursor <= '9') || *cursor == '_') {
		if (idx + 1 < out_len) out[idx++] = *cursor;
		cursor++;
	}
	out[idx] = '\0';
	*ptr = cursor;
	return 1;
}

/* match literal helper */
int match_literal(const char **ptr, const char *lit, int require_word_boundary) {
	skip_ws(ptr);
	const char *s = *ptr;
	size_t len = strlen(lit);
	if (strncmp(s, lit, len) != 0) return 0;
	if (require_word_boundary) {
		char next = s[len];
		if (next && (isalnum((unsigned char)next) || next == '_')) return 0;
	}
	*ptr = s + len;
	return 1;
}

int parse_type(const char **ptr, int *out_type) {
	skip_ws(ptr);
	if (match_literal(ptr, "I32", 0)) {
		if (out_type) *out_type = VT_I32;
		return 1;
	}
	if (match_literal(ptr, "Bool", 0)) {
		if (out_type) *out_type = VT_BOOL;
		return 1;
	}
	return 0;
}

/* Parser implementation: factor, term, additive, logical AND/OR */
static int parse_expr_internal(const char **ptr, long long *out_val);
static int parse_additive(const char **ptr, long long *out_val);
static int parse_logical_and(const char **ptr, long long *out_val);
static int parse_logical_or(const char **ptr, long long *out_val);
static int parse_factor(const char **ptr, long long *out_val);

/* helper: parse the tail of an if expression after 'if' was consumed */
static int parse_if_tail(const char **ptr, long long *out_val) {
	skip_ws(ptr);
	if (**ptr != '(') return 0;
	(*ptr)++; /* consume '(' */
	long long cond = 0;
	if (!parse_expr_internal(ptr, &cond)) return 0;
	skip_ws(ptr);
	if (**ptr != ')') return 0;
	(*ptr)++; /* consume ')' */
	long long then_val = 0;
	if (!parse_expr_internal(ptr, &then_val)) return 0;
	skip_ws(ptr);
	if (!match_literal(ptr, "else", 1)) return 0;
	long long else_val = 0;
	if (!parse_expr_internal(ptr, &else_val)) return 0;
	*out_val = (cond ? then_val : else_val);
	return 1;
}

/* factor := number | identifier | '(' expr ')' | boolean | if-expression */
static int parse_factor(const char **ptr, long long *out_val) {
	skip_ws(ptr);
	/* if-expression: if (cond) then_expr else else_expr */
	if (match_literal(ptr, "if", 1)) {
		return parse_if_tail(ptr, out_val);
	}
	if (match_literal(ptr, "true", 0)) {
		*out_val = 1;
		return 1;
	}
	if (match_literal(ptr, "false", 0)) {
		*out_val = 0;
		return 1;
	}
	if (**ptr == '(') {
		(*ptr)++;
		long long val = 0;
		if (!parse_expr_internal(ptr, &val)) return 0;
		skip_ws(ptr);
		if (**ptr != ')') return 0;
		(*ptr)++;
		*out_val = val;
		return 1;
	}
	/* identifier? */
	if ((**ptr >= 'A' && **ptr <= 'Z') || (**ptr >= 'a' && **ptr <= 'z') || **ptr == '_') {
		char name[MAX_VAR_NAME];
		if (!parse_identifier(ptr, name, sizeof(name))) return 0;
		struct var_entry *entry = find_var(name);
		if (!entry) return 0;
		*out_val = entry->value;
		return 1;
	}
	long num = 0;
	if (!parse_number(ptr, &num)) return 0;
	*out_val = num;
	return 1;
}

typedef struct {
	const char *ops;
	int (*rhs_parser)(const char **, long long *);
} binseq_ctx;
static int parse_binseq(const char **ptr, long long *accum, const binseq_ctx *ctx) {
	skip_ws(ptr);
	while (**ptr && strchr(ctx->ops, **ptr)) {
		char opch = **ptr;
		(*ptr)++;
		skip_ws(ptr);
		long long rhsval = 0;
		if (!ctx->rhs_parser(ptr, &rhsval)) return 0;
		long long res = 0;
		switch (opch) {
		case '+':
			res = *accum + rhsval;
			break;
		case '-':
			res = *accum - rhsval;
			break;
		case '*':
			res = *accum * rhsval;
			break;
		case '/':
			if (rhsval == 0) return 0;
			res = *accum / rhsval;
			break;
		default:
			return 0;
		}
		if (res < INT_MIN || res > INT_MAX) return 0;
		*accum = res;
		skip_ws(ptr);
	}
	return 1;
}

static int parse_term(const char **ptr, long long *out_val) {
	long long accum = 0;
	if (!parse_factor(ptr, &accum)) return 0;
	const binseq_ctx muldiv_ctx = {"*/", parse_factor};
	if (!parse_binseq(ptr, &accum, &muldiv_ctx)) return 0;
	*out_val = accum;
	return 1;
}

static int parse_additive(const char **ptr, long long *out_val) {
	long long accum = 0;
	if (!parse_term(ptr, &accum)) return 0;
	const binseq_ctx addsub_ctx = {"+-", parse_term};
	if (!parse_binseq(ptr, &accum, &addsub_ctx)) return 0;
	*out_val = accum;
	return 1;
}

/* logical */
typedef struct {
	const char *token;
	int (*rhs_parser)(const char **, long long *);
	int is_or;
} token_ctx;

static int parse_binseq_token(const char **ptr, long long *accum, const token_ctx *ctx) {
	skip_ws(ptr);
	size_t tlen = strlen(ctx->token);
	while (**ptr && strncmp(*ptr, ctx->token, tlen) == 0) {
		(*ptr) += tlen;
		skip_ws(ptr);
		long long rhs = 0;
		if (!ctx->rhs_parser(ptr, &rhs)) return 0;
		if (ctx->is_or) {
			*accum = (*accum || rhs) ? 1 : 0;
		} else {
			*accum = (*accum && rhs) ? 1 : 0;
		}
		skip_ws(ptr);
	}
	return 1;
}

static int parse_logical_and(const char **ptr, long long *out_val) {
	if (!parse_additive(ptr, out_val)) return 0;
	const token_ctx ctx = {"&&", parse_additive, 0};
	return parse_binseq_token(ptr, out_val, &ctx);
}

static int parse_logical_or(const char **ptr, long long *out_val) {
	if (!parse_logical_and(ptr, out_val)) return 0;
	const token_ctx ctx = {"||", parse_logical_and, 1};
	return parse_binseq_token(ptr, out_val, &ctx);
}

static int parse_expr_internal(const char **ptr, long long *out_val) {
	return parse_logical_or(ptr, out_val);
}

int parse_expr(const char **ptr, long long *out_val) {
	return parse_expr_internal(ptr, out_val);
}
