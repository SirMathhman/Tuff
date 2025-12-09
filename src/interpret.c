#include "interpret.h"
#include <stdlib.h>
#include <string.h>

// Minimal stub implementation: if input is NULL return NULL, otherwise
// return a newly allocated string containing the fixed text "stubbed".
char *interpret(const char *input)
{
	if (!input)
		return NULL;
	const char *out = "stubbed";
	char *res = (char *)malloc(strlen(out) + 1);
	if (!res)
		return NULL;
	strcpy(res, out);
	return res;
}
