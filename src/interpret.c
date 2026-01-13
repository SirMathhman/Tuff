#include "interpret.h"
#include <stdlib.h>
#include <limits.h>
#include <string.h>
#include <stdint.h>
#include <errno.h>
#include <ctype.h>

static long long parse_single(const char *input, char **endptr);
static long long parse_term(const char **input);
static long long parse_expression(const char **input);

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

static long long parse_single(const char *input, char **endptr)
{
	while (isspace((unsigned char)*input))
		input++;
	
	if (*input == '(')
	{
		const char *next = input + 1;
		long long val = parse_expression(&next);
		while (isspace((unsigned char)*next))
			next++;
		if (*next == ')')
			next++;
		*endptr = (char *)next;
		return val;
	}

	if (*input == '\0')
		return 0;

	errno = 0;
	long long val = strtoll(input, endptr, 10);
	if (*endptr == input)
		return 0;

	char *suffix_end = *endptr;
	while (*suffix_end && !isspace((unsigned char)*suffix_end) &&
				 *suffix_end != '+' && *suffix_end != '-' && 
				 *suffix_end != '*' && *suffix_end != '/' &&
				 *suffix_end != ')')
		suffix_end++;

	char suffix[16] = {0};
	size_t len = suffix_end - *endptr;
	if (len > 0 && len < sizeof(suffix))
	{
		strncpy(suffix, *endptr, len);
		if (check_suffix(suffix, val))
		{
			errno = ERANGE;
			return INT_MIN;
		}
	}
	*endptr = suffix_end;
	return val;
}

static long long parse_term(const char **input)
{
	char *next = (char *)*input;
	long long val = parse_single(next, &next);
	if (errno == ERANGE && val == INT_MIN)
	{
		*input = next;
		return INT_MIN;
	}

	while (1)
	{
		while (isspace((unsigned char)*next))
			next++;
		if (*next == '*' || *next == '/')
		{
			char op = *next;
			next++;
			long long next_val = parse_single(next, &next);
			if (errno == ERANGE && next_val == INT_MIN)
			{
				*input = next;
				return INT_MIN;
			}
			if (op == '*')
			{
				val *= next_val;
			}
			else
			{
				if (next_val == 0)
				{
					errno = ERANGE;
					return INT_MIN;
				}
				val /= next_val;
			}
		}
		else
		{
			break;
		}
	}
	*input = next;
	return val;
}

static long long parse_expression(const char **input)
{
	const char *next = *input;
	long long total = parse_term(&next);
	if (errno == ERANGE && total == INT_MIN)
	{
		*input = next;
		return INT_MIN;
	}

	while (1)
	{
		while (isspace((unsigned char)*next))
			next++;
		if (*next == '+' || *next == '-')
		{
			char op = *next;
			next++;
			long long val = parse_term(&next);
			if (errno == ERANGE && val == INT_MIN)
			{
				*input = next;
				return INT_MIN;
			}
			if (op == '+')
				total += val;
			else
				total -= val;
		}
		else
		{
			break;
		}
	}
	*input = next;
	return total;
}

int interpret(const char *input)
{
	if (!input)
		return 0;

	const char *next = input;
	long long total = parse_expression(&next);

	if (total > INT_MAX)
		return INT_MAX;
	if (total < INT_MIN)
		return INT_MIN;

	return (int)total;
}
