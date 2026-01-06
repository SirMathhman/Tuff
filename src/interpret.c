#include "interpret.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
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

/* Forward declarations for recursive-descent parser */
static int parse_expr(const char **ptr, long long *out_val);
static int parse_term(const char **ptr, long long *out_val);
static int parse_factor(const char **ptr, long long *out_val);

/* factor := number | '(' expr ')' */
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

/* Try parse full expression and ensure whole string consumed */
static int parse_full_expr(const char *str, int *out_val) {
	const char *ptr = str;
	long long val = 0;
	if (!parse_expr(&ptr, &val)) return 0;
	skip_ws(&ptr);
	if (*ptr != '\0') return 0;
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
