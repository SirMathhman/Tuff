#include "interpret.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
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

/* Simple symbol table for I32 variables */
#define MAX_VARS 64
#define MAX_VAR_NAME 32
struct var_entry {
	char name[MAX_VAR_NAME];
	int value;
};
static struct var_entry vars[MAX_VARS];
static int vars_count = 0;

/* Helper forward declaration */
static void copy_str_bounded(char *dst, const char *src, size_t dst_len);

static struct var_entry *find_var(const char *name) {
	for (int idx = 0; idx < vars_count; idx++) {
		if (strcmp(vars[idx].name, name) == 0) return &vars[idx];
	}
	return NULL;
}

static int set_var(const char *name, int value) {
	struct var_entry *entry = find_var(name);
	if (entry) {
		entry->value = value;
		return 1;
	}
	if (vars_count >= MAX_VARS) return 0;
	copy_str_bounded(vars[vars_count].name, name, MAX_VAR_NAME);
	vars[vars_count].value = value;
	vars_count++;
	return 1;
}

/* Forward declarations for recursive-descent parser */
static int parse_expr(const char **ptr, long long *out_val);
static int parse_term(const char **ptr, long long *out_val);
static int parse_factor(const char **ptr, long long *out_val);

/* factor := number | identifier | '(' expr ')' */
static int parse_factor(const char **ptr, long long *out_val) {
	skip_ws(ptr);
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

/* Helper: parse repeated binary operations where rhs_parser parses the right-hand operand.
 * ops is a NUL-terminated string of valid operator characters (for example, '*' and '/' or '+' and
 * '-').
 */
static int parse_binseq(const char **ptr, long long *accum, const char *ops,
                        int (*rhs_parser)(const char **, long long *)) {
	skip_ws(ptr);
	while (**ptr && strchr(ops, **ptr)) {
		char opch = **ptr;
		(*ptr)++;
		skip_ws(ptr);
		long long rhsval = 0;
		if (!rhs_parser(ptr, &rhsval)) return 0;
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
	if (!parse_binseq(ptr, &accum, "*/", parse_factor)) return 0;
	*out_val = accum;
	return 1;
}

/* expr := term ( ('+' | '-') term )* */
static int parse_expr(const char **ptr, long long *out_val) {
	long long accum = 0;
	if (!parse_term(ptr, &accum)) return 0;
	if (!parse_binseq(ptr, &accum, "+-", parse_term)) return 0;
	*out_val = accum;
	return 1;
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

static int parse_type_I32(const char **ptr) {
	return match_literal(ptr, "I32", 0);
}

static int parse_declaration(const char **ptr, char *name_out, size_t name_len, int *out_val) {
	const char *cursor = *ptr;
	skip_ws(&cursor);
	if (!parse_identifier(&cursor, name_out, name_len)) return 0;
	skip_ws(&cursor);
	if (*cursor != ':') return 0;
	cursor++;
	skip_ws(&cursor);
	if (!parse_type_I32(&cursor)) return 0;
	skip_ws(&cursor);
	if (*cursor != '=') return 0;
	cursor++;
	long long val = 0;
	if (!parse_expr(&cursor, &val)) return 0;
	skip_ws(&cursor);
	if (*cursor != ';') return 0;
	cursor++;
	/* successful declaration: store variable */
	if (val < INT_MIN || val > INT_MAX) return 0;
	if (!set_var(name_out, (int)val)) return 0;
	*ptr = cursor;
	if (out_val) *out_val = 0;
	return 1;
}

static int parse_statement_at(const char **ptr, int *out_val) {
	const char *cursor = *ptr;
	if (!match_let_keyword(&cursor)) return 0;
	char name[MAX_VAR_NAME];
	if (!parse_declaration(&cursor, name, sizeof(name), out_val)) return 0;
	*ptr = cursor;
	return 1;
}

/* Try parse full expression or sequence of statements and an optional trailing expression
 * Example: "let x : I32 = 1 + 2 + 3; x"
 */
static int parse_full_expr(const char *str, int *out_val) {
	const char *cursor = str;
	int tmp = 0;
	int saw_statement = 0;
	/* parse zero or more statements */
	for (;;) {
		const char *save = cursor;
		if (parse_statement_at(&cursor, &tmp)) {
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
