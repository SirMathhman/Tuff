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

static int parse_op_char(const char **pp, char *op)
{
	const char *p = *pp;
	if (*p != '+' && *p != '-' && *p != '*' && *p != '/') return 0;
	*op = *p;
	(*pp)++;
	return 1;
}

static int in_int_range(long v)
{
	return v >= INT_MIN && v <= INT_MAX;
}

/* Try to parse a binary expression `a op b`; on success write result to `out` and return 1 */
static int parse_binary_expr(const char *s, int *out) {
	const char *p = s;
	long a = 0;
	if (!parse_long(p, &a, &p)) return 0;
	skip_ws(&p);
	char op = 0;
	if (!parse_op_char(&p, &op)) return 0;
	skip_ws(&p);
	long b = 0;
	if (!parse_long(p, &b, &p)) return 0;
	skip_ws(&p);
	if (*p != '\0') return 0;
	if (errno == ERANGE || !in_int_range(a) || !in_int_range(b)) return 0;
	long long r = 0;
	if (!compute_op(op, a, b, &r)) return 0;
	if (r < INT_MIN || r > INT_MAX) return 0;
	*out = (int)r;
	return 1;
}

int interpret(const char *s) {
	if (s == NULL) return -1;
	int result = 0;
	if (parse_single_expr(s, &result)) return result;
	if (parse_binary_expr(s, &result)) return result;
	return -1;
}
