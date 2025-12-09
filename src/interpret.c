#include "interpret.h"
#include <stdlib.h>
#include <string.h>

// If input is NULL return NULL.
// If input ends with the suffix "U8" (case-insensitive) return a newly
// allocated string with that suffix stripped. Otherwise return the
// fixed text "stubbed".
char *interpret(const char *input)
{
	if (!input)
		return NULL;
	size_t inlen = strlen(input);
	if (inlen >= 2)
	{
		char last = input[inlen - 1];
		char prev = input[inlen - 2];
		if ((prev == 'U' || prev == 'u') && last == '8')
		{
			if (input[0] == '-')
			{
				const char *err = "Error";
				char *res = (char *)malloc(strlen(err) + 1);
				if (!res)
					return NULL;
				strcpy(res, err);
				return res;
			}
			size_t outlen = inlen - 2;
			char *res = (char *)malloc(outlen + 1);
			if (!res)
				return NULL;
			if (outlen > 0)
				memcpy(res, input, outlen);
			res[outlen] = '\0';
			return res;
		}
	}

	const char *out = "stubbed";
	char *res = (char *)malloc(strlen(out) + 1);
	if (!res)
		return NULL;
	strcpy(res, out);
	return res;
}
