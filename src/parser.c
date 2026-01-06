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

/* helpers for boolean-range detection */
static int get_identifier_end_range(const char *start, const char *end, const char **next_out) {
	const char *cur = start;
	if (!(((*cur >= 'A' && *cur <= 'Z') || (*cur >= 'a' && *cur <= 'z') || *cur == '_'))) return 0;
	const char *scan = cur;
	while (scan < end && (((*scan >= 'A' && *scan <= 'Z') || (*scan >= 'a' && *scan <= 'z') ||
	                       (*scan >= '0' && *scan <= '9') || *scan == '_')))
		scan++;
	if (next_out) *next_out = scan;
	return 1;
}

static int match_bool_literal_at_range(const char *start, const char *end, const char **next) {
	const char *literals[] = {"true", "false"};
	size_t lengths[] = {4, 5};
	for (int i = 0; i < 2; i++) {
		const char *lit = literals[i];
		size_t len = lengths[i];
		if (start + len <= end && strncmp(start, lit, len) == 0 &&
		    ((start + len == end) || (!isalnum((unsigned char)start[len]) && start[len] != '_'))) {
			if (next) *next = start + len;
			return 1;
		}
	}
	return 0;
}

static int match_bool_operator_at_range(const char *start, const char *end, const char **next_out) {
	if (start + 2 <= end && start[0] == '&' && start[1] == '&') {
		if (next_out) *next_out = start + 2;
		return 1;
	}
	if (start + 2 <= end && start[0] == '|' && start[1] == '|') {
		if (next_out) *next_out = start + 2;
		return 1;
	}
	if (start < end && start[0] == '!') {
		if (next_out) *next_out = start + 1;
		return 1;
	}
	return 0;
}

static int try_consume_bool_token(const char **pptr, const char *end) {
	const char *ptr = *pptr;
	const char *next = NULL;
	/* parentheses */
	if (ptr < end && (*ptr == '(' || *ptr == ')')) {
		*pptr = ptr + 1;
		return 1;
	}
	if (match_bool_operator_at_range(ptr, end, &next)) {
		*pptr = next;
		return 1;
	}
	if (match_bool_literal_at_range(ptr, end, &next)) {
		*pptr = next;
		return 1;
	}
	/* identifier */
	const char *id_end = NULL;
	if (get_identifier_end_range(ptr, end, &id_end)) {
		size_t len = (size_t)(id_end - ptr);
		if (len == 0 || len >= MAX_VAR_NAME) return 0;
		char name[MAX_VAR_NAME];
		memcpy(name, ptr, len);
		name[len] = '\0';
		struct var_entry *entry = find_var(name);
		if (!entry) return 0;
		if (entry->type != VT_BOOL) return 0;
		*pptr = id_end;
		return 1;
	}
	return 0;
}

int is_boolean_expr(const char *start, const char *end) {
	const char *ptr = start;
	while (ptr < end) {
		while (ptr < end && isspace((unsigned char)*ptr))
			ptr++;
		if (ptr >= end) break;
		if (try_consume_bool_token(&ptr, end)) continue;
		/* numeric literal -> not boolean */
		if (isdigit((unsigned char)*ptr)) return 0;
		return 0;
	}
	return 1;
}

typedef struct {
	const char *cond_start;
	const char *cond_end;
	const char *then_start;
	const char *then_end;
	const char *else_start;
	const char *else_end;
	long long *then_val;
	long long *else_val;
} if_validate_ctx;

static int validate_if_branches(const if_validate_ctx *ctx) {
	/* Validate condition is boolean */
	if (!is_boolean_expr(ctx->cond_start, ctx->cond_end)) return 0;
	/* Ensure both branches are same type: both boolean or both numeric */
	int then_is_bool = is_boolean_expr(ctx->then_start, ctx->then_end);
	int else_is_bool = is_boolean_expr(ctx->else_start, ctx->else_end);
	if (then_is_bool && else_is_bool) {
		/* coerce to 0/1 */
		*ctx->then_val = (*ctx->then_val != 0) ? 1 : 0;
		*ctx->else_val = (*ctx->else_val != 0) ? 1 : 0;
		return 1;
	}
	if (!then_is_bool && !else_is_bool) {
		return 1;
	}
	/* mismatched branch types */
	errno = EINVAL;
	return 0;
}

/* helper: parse the tail of an if expression after 'if' was consumed */
static int parse_if_tail(const char **ptr, long long *out_val) {
	skip_ws(ptr);
	if (**ptr != '(') return 0;
	(*ptr)++; /* consume '(' */
	/* parse condition (record range to validate) */
	const char *cond_start = *ptr;
	long long cond = 0;
	if (!parse_expr_internal(ptr, &cond)) return 0;
	const char *cond_end = *ptr;
	/* parse the rest of the if-then-else (ranges checked later) */
	skip_ws(ptr);
	if (**ptr != ')') return 0;
	(*ptr)++; /* consume ')' */
	/* parse then-expression and record range */
	const char *then_start = *ptr;
	long long then_val = 0;
	if (!parse_expr_internal(ptr, &then_val)) return 0;
	const char *then_end = *ptr;
	skip_ws(ptr);
	if (!match_literal(ptr, "else", 1)) return 0;
	/* parse else-expression and record range */
	const char *else_start = *ptr;
	long long else_val = 0;
	if (!parse_expr_internal(ptr, &else_val)) return 0;
	const char *else_end = *ptr;
	if_validate_ctx vctx = {.cond_start = cond_start,
	                        .cond_end = cond_end,
	                        .then_start = then_start,
	                        .then_end = then_end,
	                        .else_start = else_start,
	                        .else_end = else_end,
	                        .then_val = &then_val,
	                        .else_val = &else_val};
	if (!validate_if_branches(&vctx)) return 0;
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
