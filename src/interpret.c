#include "interpret.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdlib.h>

int interpret(const char *s) {
	if (s == NULL) return -1;
	errno = 0;
	char *end = NULL;
	long val = strtol(s, &end, 10);
	/* No digits were found */
	if (end == s) return -1;
	/* Skip whitespace */
	while (*end != '\0' && isspace((unsigned char)*end))
		end++;
	/* If end of string, it's a single integer */
	if (*end == '\0') {
		/* Range/overflow check */
		if (errno == ERANGE || val < INT_MIN || val > INT_MAX) return -1;
		return (int)val;
	}
	/* Expect a binary operator: + - * / */
	char op = *end;
	if (op != '+' && op != '-' && op != '*' && op != '/') return -1;
	end++;
	/* Skip whitespace before second operand */
	while (*end != '\0' && isspace((unsigned char)*end))
		end++;
	if (*end == '\0') return -1; /* no second operand */
	errno = 0;
	char *end2 = NULL;
	long val2 = strtol(end, &end2, 10);
	if (end2 == end) return -1; /* second not a number */
	/* Allow trailing whitespace only */
	while (*end2 != '\0' && isspace((unsigned char)*end2))
		end2++;
	if (*end2 != '\0') return -1;
	/* Range/overflow checks for both operands */
	if (errno == ERANGE || val2 < INT_MIN || val2 > INT_MAX) return -1;
	if (errno == ERANGE || val < INT_MIN || val > INT_MAX) return -1;
	long long r = 0;
	switch (op) {
	case '+': r = (long long)val + (long long)val2; break;
	case '-': r = (long long)val - (long long)val2; break;
	case '*': r = (long long)val * (long long)val2; break;
	case '/':
		if (val2 == 0) return -1;
		r = (long long)val / (long long)val2; break;
	default: return -1;
	}
	if (r < INT_MIN || r > INT_MAX) return -1;
	return (int)r;
}
