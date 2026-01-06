#include "interpret.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define STRTO_BASE 10

/* Helper: skip whitespace in a const char** pointer */
static void skip_ws(const char **ptr) {
	while (**ptr != '\0' && isspace((unsigned char)**ptr))
		(*ptr)++;
}

/* Helper: parse a long from string; returns 1 on success, 0 on failure */
static int parse_long(const char *str, long *out_val, const char **endptr) {
	errno = 0;
	char *end = NULL;
	long val = strtol(str, &end, STRTO_BASE);
	if (end == str) return 0;
	*out_val = val;
	if (endptr) *endptr = end;
	return 1;
}

/* Parse a number from *ptr using parse_long; advance *ptr; return 1 on success */
static int parse_number(const char **ptr, long *out_val) {
	const char *end = NULL;
	if (!parse_long(*ptr, out_val, &end)) return 0;
	*ptr = end;
	return 1;
}

/* Parse identifier: [A-Za-z_][A-Za-z0-9_]* into out (null-terminated). Advances *ptr. */
static int parse_identifier(const char **ptr, char *out, size_t out_len) {
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

/* Simple symbol table for variables */
#define MAX_VARS 64
#define MAX_VAR_NAME 32
enum var_type { VT_I32 = 0, VT_BOOL = 1 };
struct var_entry {
	char name[MAX_VAR_NAME];
	int value; /* I32 value or Bool as 0/1 */
	int type;  /* one of enum var_type */
};
static struct var_entry vars[MAX_VARS];
static int vars_count = 0;

/* Helper forward declaration */
static void copy_str_bounded(char *dst, const char *src, size_t dst_len);
static int match_literal(const char **ptr, const char *lit, int require_word_boundary);

static struct var_entry *find_var(const char *name) {
	for (int idx = 0; idx < vars_count; idx++) {
		if (strcmp(vars[idx].name, name) == 0) return &vars[idx];
	}
	return NULL;
}

int set_var(const char *name, int value, int type) {
	struct var_entry *entry = find_var(name);
	if (entry) {
		entry->value = value;
		entry->type = type;
		return 1;
	}
	if (vars_count >= MAX_VARS) return 0;
	copy_str_bounded(vars[vars_count].name, name, MAX_VAR_NAME);
	vars[vars_count].value = value;
	vars[vars_count].type = type;
	vars_count++;
	return 1;
}

/* Forward declarations for recursive-descent parser */
static int parse_expr(const char **ptr, long long *out_val);
static int parse_logical_or(const char **ptr, long long *out_val);
static int parse_logical_and(const char **ptr, long long *out_val);
static int parse_additive(const char **ptr, long long *out_val);
static int parse_term(const char **ptr, long long *out_val);
static int parse_factor(const char **ptr, long long *out_val);

/* factor := number | identifier | '(' expr ')' | boolean */
static int parse_factor(const char **ptr, long long *out_val) {
	skip_ws(ptr);
	/* boolean literals */
	if (match_literal(ptr, "true", 0)) {
		*out_val = 1;
		return 1;
	}
	if (match_literal(ptr, "false", 0)) {
		*out_val = 0;
		return 1;
	}
	if (**ptr == '(') {
		(*ptr)++; /* consume '(' */
		long long val = 0;
		if (!parse_expr(ptr, &val)) return 0;
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
		if (!entry) return 0; /* unknown identifier */
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

/* Helper: parse repeated binary operations where rhs_parser parses the right-hand operand.
 * Uses a context struct so the function has at most 3 parameters.
 */
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

/* term := factor ( ('*' | '/') factor )* */
static int parse_term(const char **ptr, long long *out_val) {
	long long accum = 0;
	if (!parse_factor(ptr, &accum)) return 0;
	const binseq_ctx muldiv_ctx = {"*/", parse_factor};
	if (!parse_binseq(ptr, &accum, &muldiv_ctx)) return 0;
	*out_val = accum;
	return 1;
}

/* additive := term ( ('+' | '-') term )* */
static int parse_additive(const char **ptr, long long *out_val) {
	long long accum = 0;
	if (!parse_term(ptr, &accum)) return 0;
	const binseq_ctx addsub_ctx = {"+-", parse_term};
	if (!parse_binseq(ptr, &accum, &addsub_ctx)) return 0;
	*out_val = accum;
	return 1;
}

typedef struct {
	const char *token;
	int (*rhs_parser)(const char **, long long *);
	int is_or;
} token_ctx;

static int parse_binseq_token(const char **ptr, long long *accum, const token_ctx *ctx) {
	skip_ws(ptr);
	size_t tlen = strlen(ctx->token);
	while (**ptr && strncmp(*ptr, ctx->token, tlen) == 0) {
		(*ptr) += tlen; /* consume token */
		skip_ws(ptr);
		long long rhs = 0;
		if (!ctx->rhs_parser(ptr, &rhs)) return 0;
		if (ctx->is_or)
			*accum = (*accum || rhs) ? 1 : 0;
		else
			*accum = (*accum && rhs) ? 1 : 0;
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

/* top-level expr now handles logical operators */
static int parse_expr(const char **ptr, long long *out_val) {
	return parse_logical_or(ptr, out_val);
}

static void copy_str_bounded(char *dst, const char *src, size_t dst_len) {
	size_t idx = 0;
	if (dst_len == 0) return;
	while (idx + 1 < dst_len && src[idx] != '\0') {
		dst[idx] = src[idx];
		idx++;
	}
	dst[idx] = '\0';
}

static int match_literal(const char **ptr, const char *lit, int require_word_boundary) {
	skip_ws(ptr);
	const char *cur = *ptr;
	size_t len = strlen(lit);
	if (strncmp(cur, lit, len) != 0) return 0;
	if (require_word_boundary) {
		char next = cur[len];
		if (next && (isalnum((unsigned char)next) || next == '_')) return 0;
	}
	*ptr = cur + len;
	return 1;
}

static int match_let_keyword(const char **ptr) {
	return match_literal(ptr, "let", 1);
}

static int parse_type(const char **ptr, int *out_type) {
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

#define TRUE_LEN 4
#define FALSE_LEN 5

static int match_bool_literal_at(const char *start, const char *end, const char **next) {
	const char *literals[] = {"true", "false"};
	size_t lengths[] = {TRUE_LEN, FALSE_LEN};
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

static struct var_entry *find_var_by_range(const char *start, size_t len) {
	for (int idx = 0; idx < vars_count; idx++) {
		if ((int)strlen(vars[idx].name) == (int)len && memcmp(vars[idx].name, start, len) == 0)
			return &vars[idx];
	}
	return NULL;
}

static int get_identifier_end(const char *start, const char *end, const char **next_out) {
	const char *cur = start;
	if (!(((*cur >= 'A' && *cur <= 'Z') || (*cur >= 'a' && *cur <= 'z') || *cur == '_'))) return 0;
	const char *scan = cur;
	while (scan < end && (((*scan >= 'A' && *scan <= 'Z') || (*scan >= 'a' && *scan <= 'z') ||
	                       (*scan >= '0' && *scan <= '9') || *scan == '_')))
		scan++;
	if (next_out) *next_out = scan;
	return 1;
}

static int match_bool_identifier(const char *start, const char *end, const char **next_out) {
	const char *id_end = NULL;
	if (!get_identifier_end(start, end, &id_end)) return 0;
	size_t len = (size_t)(id_end - start);
	struct var_entry *entry = find_var_by_range(start, len);
	if (!entry) return 0;
	if (entry->type != VT_BOOL) return 0;
	if (next_out) *next_out = id_end;
	return 1;
}

static int match_bool_operator_at(const char *start, const char *end, const char **next_out) {
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

static int match_paren_at(const char *start, const char *end, const char **next_out) {
	if (start < end && (start[0] == '(' || start[0] == ')')) {
		if (next_out) *next_out = start + 1;
		return 1;
	}
	return 0;
}

/* forward */
static int is_boolean_expr(const char *start, const char *end);

typedef struct {
	const char **cursor_ptr;
	const char *name;
	int vtype;
	int type_explicit;
	int start_vars;
	const char *expr_start;
	long long val;
} decl_ctx;

static int finalize_declaration(const decl_ctx *ctx) {
	const char *cursor = *ctx->cursor_ptr;
	/* If explicit Bool type was provided, require the RHS to be a boolean expression */
	if (ctx->type_explicit && ctx->vtype == VT_BOOL) {
		if (!is_boolean_expr(ctx->expr_start, cursor)) {
			errno = EINVAL;
			return 0;
		}
	}
	/* expect semicolon */
	skip_ws(&cursor);
	if (*cursor != ';') return 0;
	cursor++;
	/* ensure not declared earlier in this same parse */
	struct var_entry *existing = find_var(ctx->name);
	if (existing && (int)(existing - vars) >= ctx->start_vars) {
		errno = EEXIST;
		return 0;
	}
	/* normalize and store */
	if (ctx->vtype == VT_BOOL) {
		if (ctx->val != 0) {
			/* ok */
		}
		/* stored as 0/1 later */
	}
	if (ctx->val < INT_MIN || ctx->val > INT_MAX) return 0;
	if (!set_var(ctx->name, (int)ctx->val, ctx->vtype)) return 0;
	*ctx->cursor_ptr = cursor;
	return 1;
}

int is_boolean_expr(const char *start, const char *end) {
	const char *ptr = start;
	while (ptr < end) {
		while (ptr < end && isspace((unsigned char)*ptr))
			ptr++;
		if (ptr >= end) break;
		const char *next = NULL;
		if (match_paren_at(ptr, end, &next)) {
			ptr = next;
			continue;
		}
		if (match_bool_operator_at(ptr, end, &next)) {
			ptr = next;
			continue;
		}
		if (match_bool_literal_at(ptr, end, &next)) {
			ptr = next;
			continue;
		}
		if (match_bool_identifier(ptr, end, &next)) {
			ptr = next;
			continue;
		}
		if (isdigit((unsigned char)*ptr)) return 0;
		return 0;
	}
	return 1;
}

static int parse_declaration(const char **ptr, char *name_out, int start_vars) {
	const char *cursor = *ptr;
	skip_ws(&cursor);
	if (!parse_identifier(&cursor, name_out, sizeof(vars[0].name))) return 0;
	skip_ws(&cursor);
	int vtype = VT_I32;
	int type_explicit = 0;
	/* optional type annotation: ": I32" or ": Bool" */
	if (*cursor == ':') {
		type_explicit = 1;
		cursor++;
		skip_ws(&cursor);
		if (!parse_type(&cursor, &vtype)) return 0;
		skip_ws(&cursor);
	}
	if (*cursor != '=') return 0;
	cursor++;
	const char *expr_start = cursor;
	long long val = 0;
	if (!parse_expr(&cursor, &val)) return 0;
	/* Delegate final validation and storage to helper */
	decl_ctx dctx;
	dctx.cursor_ptr = &cursor;
	dctx.name = name_out;
	dctx.vtype = vtype;
	dctx.type_explicit = type_explicit;
	dctx.start_vars = start_vars;
	dctx.expr_start = expr_start;
	dctx.val = val;
	if (!finalize_declaration(&dctx)) return 0;
	*ptr = cursor;
	return 1;
}

static int parse_statement_at(const char **ptr, int start_vars) {
	const char *cursor = *ptr;
	if (!match_let_keyword(&cursor)) return 0;
	char name[MAX_VAR_NAME];
	if (!parse_declaration(&cursor, name, start_vars)) return 0;
	*ptr = cursor;
	return 1;
}

/* Try parse full expression or sequence of statements and an optional trailing expression
 * Example: "let x : I32 = 1 + 2 + 3; x"
 */
static int parse_full_expr(const char *str, int *out_val) {
	const char *cursor = str;
	int saw_statement = 0;
	/* parse zero or more statements */
	int start_vars = vars_count;
	for (;;) {
		const char *save = cursor;
		if (parse_statement_at(&cursor, start_vars)) {
			saw_statement = 1;
			skip_ws(&cursor);
			continue;
		}
		cursor = save;
		break;
	}
	/* If we only had statements and nothing else, return 0 */
	skip_ws(&cursor);
	if (*cursor == '\0') {
		if (saw_statement) {
			if (out_val) *out_val = 0;
			return 1;
		}
		return 0;
	}
	/* parse trailing expression */
	long long val = 0;
	if (!parse_expr(&cursor, &val)) return 0;
	skip_ws(&cursor);
	if (*cursor != '\0') return 0;
	if (val < INT_MIN || val > INT_MAX) return 0;
	*out_val = (int)val;
	return 1;
}

static interpret_result interpret_success(int value) {
	interpret_result res;
	res.ok = 1;
	res.value = value;
	res.err = 0;
	return res;
}

static interpret_result interpret_error(int err) {
	interpret_result res;
	res.ok = 0;
	res.value = 0;
	res.err = err;
	return res;
}

interpret_result interpret(const char *str) {
	if (str == NULL) return interpret_error(EINVAL);
	int result = 0;
	/* parse_full_expr handles numbers, precedence, and parentheses */
	if (parse_full_expr(str, &result)) return interpret_success(result);
	/* On parse failure, return EINVAL by default (or errno if set) */
	return interpret_error(errno ? errno : EINVAL);
}
