#include "interpret.h"
#include <stdlib.h>
#include <limits.h>

int interpret(const char *input)
{
	if (!input)
	{
		return 0;
	}
	char *end = NULL;
	long val = strtol(input, &end, 10);
	if (end == input)
	{
		/* no numeric conversion could be performed */
		return 0;
	}
	/* Negative values are treated as a lower-bound error */
	if (val < 0)
	{
		return INT_MIN;
	}
	/* Clamp values beyond int range to INT_MAX */
	if (val > INT_MAX)
	{
		return INT_MAX;
	}
	return (int)val;
}
