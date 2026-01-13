#define _CRT_SECURE_NO_WARNINGS
#include "interpret.h"
#include <stdlib.h>
#include <limits.h>
#include <string.h>
#include <stdint.h>
#include <errno.h>
#include <ctype.h>

#define MAX_VARS 64
typedef struct
{
	char name[32];
	long long value;
} Variable;

typedef struct
{
	Variable vars[MAX_VARS];
	int count;
} Context;

static long long parse_expression(const char **input, Context *ctx);

static int check_suffix(const char *end, long long val)
{
	if (!end || *end == '\0')
		return 0;
	if (strcmp(end, "U8") == 0)
	{
		if (val < 0 || val > 255)
			return 1;
	}
	else if (strcmp(end, "U16") == 0)
	{
		if (val < 0 || val > 65535)
			return 1;
	}
	else if (strcmp(end, "U32") == 0)
	{
		if (val < 0 || val > 4294967295LL)
			return 1;
	}
	else if (strcmp(end, "U64") == 0)
	{
		if (val < 0)
			return 1;
	}
	else if (strcmp(end, "I8") == 0)
	{
		if (val < -128 || val > 127)
			return 1;
	}
	else if (strcmp(end, "I16") == 0)
	{
		if (val < -32768 || val > 32767)
			return 1;
	}
	else if (strcmp(end, "I32") == 0)
	{
		if (val < -2147483648LL || val > 2147483647LL)
			return 1;
	}
	return 0;
}

static void parse_let_statement(const char **input, Context *ctx)
{
	const char *ptr = *input;
	ptr += 4; // skip "let "
	while (isspace((unsigned char)*ptr))
		ptr++;
	const char *v_start = ptr;
	while (isalnum((unsigned char)*ptr) || *ptr == '_')
		ptr++;
	char v_name[32] = {0};
	if ((size_t)(ptr - v_start) < sizeof(v_name))
		strncpy(v_name, v_start, ptr - v_start);
	while (isspace((unsigned char)*ptr))
		ptr++;
	if (*ptr == ':')
	{
		ptr++;
		while (*ptr != '=' && *ptr != '\0')
			ptr++;
	}
	if (*ptr == '=')
	{
		ptr++;
		long long val = parse_expression(&ptr, ctx);
		if (ctx->count < MAX_VARS)
		{
			strncpy(ctx->vars[ctx->count].name, v_name, 31);
			ctx->vars[ctx->count].value = val;
			ctx->count++;
		}
	}
	while (isspace((unsigned char)*ptr))
		ptr++;
	if (*ptr == ';')
		ptr++;
	*input = ptr;
}

static long long parse_block(const char **input, Context *ctx)
{
	const char *ptr = *input;
	if (*ptr == '{')
		ptr++;
	long long last_val = 0;
	int has_result = 0;
	while (1)
	{
		while (isspace((unsigned char)*ptr))
			ptr++;
		if (*ptr == '}' || *ptr == '\0')
			break;
		if (strncmp(ptr, "let ", 4) == 0)
		{
			parse_let_statement(&ptr, ctx);
			has_result = 0;
		}
		else
		{
			last_val = parse_expression(&ptr, ctx);
			has_result = 1;
			while (isspace((unsigned char)*ptr))
				ptr++;
			if (*ptr == ';')
			{
				ptr++;
				has_result = 0;
			}
		}
	}
	if (!has_result)
	{
		errno = ERANGE;
		last_val = INT_MIN;
	}
	if (*ptr == '}')
		ptr++;
	*input = ptr;
	return last_val;
}

static long long lookup_variable(const char **input, Context *ctx)
{
	const char *ptr = *input;
	const char *start = ptr;
	while (isalnum((unsigned char)*ptr) || *ptr == '_')
		ptr++;
	char name[32] = {0};
	if ((size_t)(ptr - start) < sizeof(name))
		strncpy(name, start, ptr - start);
	*input = ptr;
	for (int i = 0; i < ctx->count; i++)
		if (strcmp(ctx->vars[i].name, name) == 0)
			return ctx->vars[i].value;
	return 0;
}

static long long parse_literal(const char **input)
{
	char *endptr = NULL;
	errno = 0;
	long long val = strtoll(*input, &endptr, 10);
	if (endptr == *input)
		return 0;
	const char *s_ptr = endptr;
	while (*s_ptr && !isspace((unsigned char)*s_ptr) && strchr("+-*/){};", *s_ptr) == NULL)
		s_ptr++;
	char suffix[16] = {0};
	if (s_ptr - endptr > 0 && s_ptr - endptr < 16)
	{
		strncpy(suffix, endptr, s_ptr - endptr);
		if (check_suffix(suffix, val))
		{
			errno = ERANGE;
			*input = s_ptr;
			return INT_MIN;
		}
	}
	*input = s_ptr;
	return val;
}

static long long parse_single(const char **input, Context *ctx)
{
	const char *ptr = *input;
	while (isspace((unsigned char)*ptr))
		ptr++;

	if (*ptr == '(')
	{
		ptr++;
		*input = ptr;
		long long val = parse_expression(input, ctx);
		ptr = *input;
		while (isspace((unsigned char)*ptr))
			ptr++;
		if (*ptr == ')')
			ptr++;
		*input = ptr;
		return val;
	}
	if (*ptr == '{')
		return parse_block(input, ctx);

	*input = ptr;
	if (isalpha((unsigned char)*ptr) || *ptr == '_')
		return lookup_variable(input, ctx);
	return parse_literal(input);
}

static long long parse_term(const char **input, Context *ctx)
{
	long long val = parse_single(input, ctx);
	if (errno != 0)
		return INT_MIN;
	const char *ptr = *input;
	while (1)
	{
		while (isspace((unsigned char)*ptr))
			ptr++;
		if (*ptr == '*' || *ptr == '/')
		{
			char op = *ptr++;
			long long next = parse_single(&ptr, ctx);
			if (errno != 0)
				return INT_MIN;
			if (op == '*')
				val *= next;
			else
			{
				if (next == 0)
				{
					errno = ERANGE;
					*input = ptr;
					return INT_MIN;
				}
				val /= next;
			}
		}
		else
			break;
	}
	*input = ptr;
	return val;
}

static long long parse_expression(const char **input, Context *ctx)
{
	long long total = parse_term(input, ctx);
	if (errno != 0)
		return INT_MIN;
	const char *ptr = *input;
	while (1)
	{
		while (isspace((unsigned char)*ptr))
			ptr++;
		if (*ptr == '+' || *ptr == '-')
		{
			char op = *ptr++;
			long long val = parse_term(&ptr, ctx);
			if (errno != 0)
				return INT_MIN;
			if (op == '+')
				total += val;
			else
				total -= val;
		}
		else
			break;
	}
	*input = ptr;
	return total;
}

int interpret(const char *input)
{
	if (!input)
		return 0;
	Context ctx = {0};
	const char *ptr = input;
	errno = 0;
	long long res = parse_expression(&ptr, &ctx);
	if (errno != 0)
		return INT_MIN;
	if (res > INT_MAX)
		return INT_MAX;
	if (res < INT_MIN)
		return INT_MIN;
	return (int)res;
}
