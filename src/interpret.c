#include "interpret.h"
#include <stdlib.h>
#include <limits.h>
#include <string.h>
#include <stdint.h>
#include <errno.h>

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

int interpret(const char *input)
{
	if (!input)
		return 0;
	char *end = NULL;
	errno = 0;
	long long val = strtoll(input, &end, 10);
	if (end == input)
		return 0;

	if (check_suffix(end, val))
		return INT_MIN;

	if (errno == ERANGE || val > INT_MAX)
		return INT_MAX;
	if (val < INT_MIN)
		return INT_MIN;

	return (int)val;
}
