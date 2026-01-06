#include "interpret.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdlib.h>

/* Helper: skip whitespace in a const char** pointer */
static void skip_ws(const char **pp) {
	while (**pp != '\0' && isspace((unsigned char)**pp))
		(*pp)++;
}

/* Helper: parse a long from string; returns 1 on success, 0 on failure */
static int parse_long(const char *s, long *out_val, const char **endptr) {
	errno = 0;
	char *end = NULL;
	long v = strtol(s, &end, 10);
	if (end == s) return 0;
	*out_val = v;
	if (endptr) *endptr = end;
	return 1;
}

/* Helper: compute a op b, returns 1 on success, 0 on failure (e.g., div by zero) */
static int compute_op(char op, long a, long b, long long *out) {
	switch (op) {
	case '+':
		*out = (long long)a + (long long)b;
		return 1;
	case '-':
		*out = (long long)a - (long long)b;
		return 1;
	case '*':
		*out = (long long)a * (long long)b;
		return 1;
	case '/':
		if (b == 0) return 0;
		*out = (long long)a / (long long)b;
		return 1;
	default:
		return 0;
	}
}

/* Try to parse a single integer expression that occupies the whole string.
 * On success store result in `out` and return 1, otherwise return 0.
 */
static int parse_single_expr(const char *s, int *out) {
	const char *p = s;
	long v = 0;
	if (!parse_long(p, &v, &p)) return 0;
	skip_ws(&p);
	if (*p != '\0') return 0;
	if (errno == ERANGE || v < INT_MIN || v > INT_MAX) return 0;
	*out = (int)v;
	return 1;
}

static int in_int_range(long v) {
	return v >= INT_MIN && v <= INT_MAX;
}

/* Parse a number from *pp using strtol; advance *pp; return 1 on success */
static int parse_number(const char **pp, long *out) {
	errno = 0;
	char *end = NULL;
	long v = strtol(*pp, &end, 10);
	if (end == *pp) return 0;
	*out = v;
	*pp = end;
	return 1;
}

/* Forward declarations for recursive-descent parser */
static int parse_expr(const char **pp, long long *out);
static int parse_term(const char **pp, long long *out);
static int parse_factor(const char **pp, long long *out);

/* factor := number | '(' expr ')' */
static int parse_factor(const char **pp, long long *out) {
	skip_ws(pp);
	if (**pp == '(') {
		(*pp)++; /* consume '(' */
		long long val = 0;
		if (!parse_expr(pp, &val)) return 0;
		skip_ws(pp);
		if (**pp != ')') return 0;
		(*pp)++;
		*out = val;
		return 1;
	}
	long v = 0;
	if (!parse_number(pp, &v)) return 0;
	*out = v;
	return 1;
}

/* term := factor ( ('*' | '/') factor )* */
static int parse_term(const char **pp, long long *out) {
	long long acc = 0;
	if (!parse_factor(pp, &acc)) return 0;
	skip_ws(pp);
	while (**pp == '*' || **pp == '/') {
		char op = **pp;
		(*pp)++;
		skip_ws(pp);
		long long rhs = 0;
		if (!parse_factor(pp, &rhs)) return 0;
		long long r = 0;
		if (op == '*')
			r = acc * rhs;
		else {
			if (rhs == 0) return 0;
			r = acc / rhs;
		}
		if (r < INT_MIN || r > INT_MAX) return 0;
		acc = r;
		skip_ws(pp);
	}
	*out = acc;
	return 1;
}

/* expr := term ( ('+' | '-') term )* */
static int parse_expr(const char **pp, long long *out) {
	long long acc = 0;
	if (!parse_term(pp, &acc)) return 0;
	skip_ws(pp);
	while (**pp == '+' || **pp == '-') {
		char op = **pp;
		(*pp)++;
		skip_ws(pp);
		long long rhs = 0;
		if (!parse_term(pp, &rhs)) return 0;
		long long r = 0;
		if (op == '+')
			r = acc + rhs;
		else
			r = acc - rhs;
		if (r < INT_MIN || r > INT_MAX) return 0;
		acc = r;
		skip_ws(pp);
	}
	*out = acc;
	return 1;
}

/* Try parse full expression and ensure whole string consumed */
static int parse_full_expr(const char *s, int *out) {
	const char *p = s;
	long long val = 0;
	if (!parse_expr(&p, &val)) return 0;
	skip_ws(&p);
	if (*p != '\0') return 0;
	if (val < INT_MIN || val > INT_MAX) return 0;
	*out = (int)val;
	return 1;
}

static interpret_result interpret_success(int v) {
	interpret_result r;
	r.ok = 1;
	r.value = v;
	r.err = 0;
	return r;
}

static interpret_result interpret_error(int err) {
	interpret_result r;
	r.ok = 0;
	r.value = 0;
	r.err = err;
	return r;
}

interpret_result interpret(const char *s) {
	if (s == NULL) return interpret_error(EINVAL);
	int result = 0;
	/* parse_full_expr handles numbers, precedence, and parentheses */
	if (parse_full_expr(s, &result)) return interpret_success(result);
	/* On parse failure, return EINVAL by default (or errno if set) */
	return interpret_error(errno ? errno : EINVAL);
}
