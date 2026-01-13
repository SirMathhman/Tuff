#include "interpret.h"
#include <stdlib.h>
#include <limits.h>
#include <string.h>

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

	/* Check for U8 suffix and apply range restrictions */
	if (end && strcmp(end, "U8") == 0)
	{
		if (val < 0 || val > 255)
		{
			return INT_MIN; /* Error code for out of range */
		}
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
