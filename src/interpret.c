#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "interpret.h"
#include "arena.h"

static void skipws(const char **p)
{
	while (**p && isspace((unsigned char)**p))
		(*p)++;
}

static long long parse_expr(const char **p);

static long long parse_number(const char **p)
{
	skipws(p);
	char *end;
	errno = 0;
	long long val = strtoll(*p, &end, 10);
	if (end == *p)
	{
		return 0;
	}
	*p = end;
	return val;
}

static long long parse_factor(const char **p)
{
	skipws(p);
	if (**p == '(')
	{
		(*p)++; /* consume '(' */
		long long v = parse_expr(p);
		skipws(p);
		if (**p == ')')
			(*p)++;
		return v;
	}

	/* unary +/- */
	if (**p == '+' || **p == '-')
	{
		int sign = (**p == '-') ? -1 : 1;
		(*p)++;
		return sign * parse_factor(p);
	}

	return parse_number(p);
}

static long long parse_term(const char **p)
{
	long long v = parse_factor(p);
	for (;;)
	{
		skipws(p);
		if (**p == '*')
		{
			(*p)++;
			v *= parse_factor(p);
		}
		else if (**p == '/')
		{
			(*p)++;
			long long rhs = parse_factor(p);
			if (rhs != 0)
				v /= rhs;
		}
		else
		{
			break;
		}
	}
	return v;
}

static long long parse_expr(const char **p)
{
	long long v = parse_term(p);
	for (;;)
	{
		skipws(p);
		if (**p == '+')
		{
			(*p)++;
			v += parse_term(p);
		}
		else if (**p == '-')
		{
			(*p)++;
			v -= parse_term(p);
		}
		else
		{
			break;
		}
	}
	return v;
}

char *interpret(const char *s)
{
	if (!s)
		return NULL;
	const char *p = s;
	long long val = parse_expr(&p);
	/* convert to string */
	char buf[64];
	int n = snprintf(buf, sizeof(buf), "%lld", val);
	if (n < 0)
		return NULL;
	char *out = arena_alloc((size_t)n + 1);
	if (!out)
		return NULL;
	memcpy(out, buf, (size_t)n + 1);
	return out;
}
