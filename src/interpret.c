#include "interpret.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

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
				size_t errlen = strlen(err);
				char *res = (char *)malloc(errlen + 1);
				if (!res)
					return NULL;
				memcpy(res, err, errlen + 1);
				return res;
			}

			size_t outlen = inlen - 2;

			if (outlen == 0)
			{
				const char *err = "Error";
				size_t errlen = strlen(err);
				char *res = (char *)malloc(errlen + 1);
				if (!res)
					return NULL;
				memcpy(res, err, errlen + 1);
				return res;
			}

			unsigned int val = 0;
			for (size_t i = 0; i < outlen; ++i)
			{
				unsigned char c = (unsigned char)input[i];
				if (!isdigit(c))
				{
					const char *err = "Error";
					size_t errlen = strlen(err);
					char *res = (char *)malloc(errlen + 1);
					if (!res)
						return NULL;
					memcpy(res, err, errlen + 1);
					return res;
				}
				val = val * 10 + (c - '0');
				if (val > 255)
				{
					const char *err = "Error";
					size_t errlen = strlen(err);
					char *res = (char *)malloc(errlen + 1);
					if (!res)
						return NULL;
					memcpy(res, err, errlen + 1);
					return res;
				}
			}

			char *res = (char *)malloc(outlen + 1);
			if (!res)
				return NULL;
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
