#include "interpret.h"
#include <stdlib.h>

int interpret(const char *input)
{
	if (!input) {
		return 0;
	}
	char *end = NULL;
	long val = strtol(input, &end, 10);
	if (end == input) {
		/* no numeric conversion could be performed */
		return 0;
	}
	return (int)val;
}
