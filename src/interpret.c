#include "interpret.h"
#include <stdlib.h>
#include <limits.h>
#include <string.h>
#include <stdint.h>
#include <errno.h>

int interpret(const char *input)
{
	if (!input)
	{
		return 0;
	}
	char *end = NULL;
	errno = 0;
	long long val = strtoll(input, &end, 10);
	if (end == input)
	{
		/* no numeric conversion could be performed */
		return 0;
	}

	/* Check for suffixes and apply range restrictions */
	if (end && *end != '\0')
	{
		if (strcmp(end, "U8") == 0)
		{
			if (val < 0 || val > 255) return INT_MIN;
		}
		else if (strcmp(end, "U16") == 0)
		{
			if (val < 0 || val > 65535) return INT_MIN;
		}
		else if (strcmp(end, "U32") == 0)
		{
			if (val < 0 || val > 4294967295LL) return INT_MIN;
		}
		else if (strcmp(end, "U64") == 0)
		{
			/* long long might only be 64-bit, so we can't represent all U64 above LLONG_MAX easily here */
			/* but for the purpose of this int-returning function, anything > INT_MAX is already problematic */
			if (val < 0) return INT_MIN;
		}
		else if (strcmp(end, "I8") == 0)
		{
			if (val < -128 || val > 127) return INT_MIN;
		}
		else if (strcmp(end, "I16") == 0)
		{
			if (val < -32768 || val > 32767) return INT_MIN;
		}
		else if (strcmp(end, "I32") == 0)
		{
			if (val < -2147483648LL || val > 2147483647LL) return INT_MIN;
		}
		else if (strcmp(end, "I64") == 0)
		{
			/* already handled by long long range mostly */
		}
	}

	/* Clamp/Error check for the int return type */
	if (errno == ERANGE || val > INT_MAX)
	{
		return INT_MAX;
	}
	if (val < INT_MIN)
	{
		return INT_MIN;
	}

	return (int)val;
}
