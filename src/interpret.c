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

struct Env;
static long long parse_expr(const char **p, struct Env *env);

/* Environment used for block-scoped variables */
struct Env
{
	struct Env *parent;
	struct
	{
		char name[32];
		long long val;
		int mut;
	} entries[32];
	size_t count;
};

static long long parse_number(const char **p, struct Env *env)
{
	skipws(p);
	char *end;
	errno = 0;
	long long val = strtoll(*p, &end, 10);
	if (end == *p)
	{
		/* maybe identifier */
		if (isalpha((unsigned char)**p) || **p == '_')
		{
			const char *start = *p;
			while (isalnum((unsigned char)**p) || **p == '_')
				(*p)++;
			size_t len = (size_t)(*p - start);
			char name[32];
			if (len >= sizeof(name))
				len = sizeof(name) - 1;
			memcpy(name, start, len);
			name[len] = '\0';
			/* lookup in env chain */
			for (struct Env *e = env; e; e = e->parent)
			{
				for (size_t i = 0; i < e->count; ++i)
				{
					if (strcmp(e->entries[i].name, name) == 0)
						return e->entries[i].val;
				}
			}
		}
		return 0;
	}
	*p = end;
	return val;
}

static long long parse_factor(const char **p, struct Env *env)
{
	skipws(p);
	if (**p == '(' || **p == '{')
	{
		char open = **p;
		char close = (open == '(') ? ')' : '}';
		(*p)++; /* consume opening */
		if (open == '{')
		{
			/* block: supports statements separated by ';' and 'let' bindings */
			struct Env frame;
			frame.parent = env;
			frame.count = 0;
			long long last = 0;
			for (;;)
			{
				skipws(p);
				if (**p == '}')
				{
					(*p)++;
					break;
				}
				/* check for let */
				if (strncmp(*p, "let", 3) == 0 && !isalnum((unsigned char)(*p)[3]) && (*p)[3] != '_')
				{
					*p += 3;
					skipws(p);
					int is_mut = 0;
					if (strncmp(*p, "mut", 3) == 0 && !isalnum((unsigned char)(*p)[3]) && (*p)[3] != '_') {
						is_mut = 1;
						*p += 3;
						skipws(p);
					}
					/* parse identifier */
					const char *start = *p;
					if (!(isalpha((unsigned char)**p) || **p == '_'))
					{ /* invalid, skip */
					}
					while (isalnum((unsigned char)**p) || **p == '_')
						(*p)++;
					size_t len = (size_t)(*p - start);
					char name[32];
					if (len >= sizeof(name))
						len = sizeof(name) - 1;
					memcpy(name, start, len);
					name[len] = '\0';
					skipws(p);
					if (**p == '=')
					{
						(*p)++;
					}
					long long v = parse_expr(p, &frame);
					/* store in frame */
					if (frame.count < 32)
					{
						strcpy(frame.entries[frame.count].name, name);
						frame.entries[frame.count].val = v;
						frame.entries[frame.count].mut = is_mut;
						frame.count++;
					}
					skipws(p);
					if (**p == ';')
					{
						(*p)++;
						continue;
					}
					continue;
				}
				/* assignment? detect identifier = ... */
				if ((isalpha((unsigned char)**p) || **p == '_')) {
					/* peek identifier */
					const char *q = *p;
					const char *start = q;
					while (isalnum((unsigned char)*q) || *q == '_') q++;
					/* capture identifier length before skipping whitespace */
					size_t len = (size_t)(q - start);
					const char *r = q;
					skipws(&r);
					if (*r == '=') {
						/* do assignment */
						char name[32]; if (len >= sizeof(name)) len = sizeof(name)-1;
						memcpy(name, start, len); name[len] = '\0';
						/* advance *p to after identifier and '=' */
						*p = start + len;
						skipws(p);
						if (**p == '=') (*p)++;
						long long v = parse_expr(p, &frame);
						/* find in env chain and update */
						int updated = 0;
						for (struct Env *e = &frame; e; e = e->parent) {
							for (size_t i = 0; i < e->count; ++i) {
								if (strcmp(e->entries[i].name, name) == 0) {
									e->entries[i].val = v;
									updated = 1;
									break;
								}
							}
							if (updated) break;
						}
						/* if not found, create in current frame */
						if (!updated && frame.count < 32) {
							strcpy(frame.entries[frame.count].name, name);
							frame.entries[frame.count].val = v;
							frame.entries[frame.count].mut = 1;
							frame.count++;
						}
						last = v;
						skipws(p);
						if (**p == ';') { (*p)++; continue; }
						if (**p == '}') { (*p)++; break; }
					}
				}
				/* otherwise evaluate expression in this frame */
				last = parse_expr(p, &frame);
				skipws(p);
				if (**p == ';')
				{
					(*p)++;
					continue;
				}
				if (**p == '}')
				{
					(*p)++;
					break;
				}
			}
			return last;
		}
		long long v = parse_expr(p, env);
		skipws(p);
		if (**p == close)
			(*p)++;
		return v;
	}

	/* unary +/- */
	if (**p == '+' || **p == '-')
	{
		int sign = (**p == '-') ? -1 : 1;
		(*p)++;
		return sign * parse_factor(p, env);
	}

	return parse_number(p, env);
}

static long long parse_term(const char **p, struct Env *env)
{
	long long v = parse_factor(p, env);
	for (;;)
	{
		skipws(p);
		if (**p == '*')
		{
			(*p)++;
			v *= parse_factor(p, env);
		}
		else if (**p == '/')
		{
			(*p)++;
			long long rhs = parse_factor(p, env);
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

static long long parse_expr(const char **p, struct Env *env)
{
	long long v = parse_term(p, env);
	for (;;)
	{
		skipws(p);
		if (**p == '+')
		{
			(*p)++;
			v += parse_term(p, env);
		}
		else if (**p == '-')
		{
			(*p)++;
			v -= parse_term(p, env);
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
	/* top-level environment is NULL */
	long long val = parse_expr(&p, NULL);
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
