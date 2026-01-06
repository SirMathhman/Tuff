#include "interpret.h"
#include "parser.h"
#include "symbols.h"

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int match_let_keyword(const char **ptr) {
	return match_literal(ptr, "let", 1);
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
	int is_mut;
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
	{
		struct var_entry attrs = { .value = (int)ctx->val, .type = ctx->vtype, .is_mut = ctx->is_mut };
		if (!set_var(ctx->name, &attrs)) return 0;
	}
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
	int is_mut = 0;
	/* optional 'mut' token after 'let' */
	if (match_literal(&cursor, "mut", 1)) {
		is_mut = 1;
		skip_ws(&cursor);
	}
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
	dctx.is_mut = is_mut;
	dctx.start_vars = start_vars;
	dctx.expr_start = expr_start;
	dctx.val = val;
	if (!finalize_declaration(&dctx)) return 0;
	*ptr = cursor;
	return 1;
}

static int parse_statement_at(const char **ptr, int start_vars) {
	const char *cursor = *ptr;
	/* declaration */
	if (match_let_keyword(&cursor)) {
		char name[MAX_VAR_NAME];
		if (!parse_declaration(&cursor, name, start_vars)) return 0;
		*ptr = cursor;
		return 1;
	}
	/* assignment: identifier '=' expr ';' */
	{
		const char *save = cursor;
		char name[MAX_VAR_NAME];
		if (!parse_identifier(&cursor, name, sizeof(name))) return 0;
		skip_ws(&cursor);
		if (*cursor != '=') { /* not assignment */
			return 0;
		}
		cursor++; /* consume '=' */
		const char *expr_start = cursor;
		long long val = 0;
		if (!parse_expr(&cursor, &val)) return 0;
		/* if variable exists and is Bool, ensure RHS is boolean expression */
		struct var_entry *v = find_var(name);
		if (!v) {
			errno = EINVAL;
			return 0;
		}
		if (!v->is_mut) {
			errno = EPERM;
			return 0;
		}
		if (v->type == VT_BOOL) {
			if (!is_boolean_expr(expr_start, cursor)) {
				errno = EINVAL;
				return 0;
			}
			val = (val != 0) ? 1 : 0;
		}
		skip_ws(&cursor);
		if (*cursor != ';') return 0;
		cursor++;
		v->value = (int)val;
		*ptr = cursor;
		return 1;
	}
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
