#include "interpret.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

// Helper: allocate and return a copy of a string
static char *alloc_string(const char *str)
{
	size_t len = strlen(str);
	char *res = (char *)malloc(len + 1);
	if (!res)
		return NULL;
	memcpy(res, str, len + 1);
	return res;
}

// Helper: validate U8 numeric value (0-255) from input substring
static int validate_u8_range(const char *input, size_t len)
{
	if (len == 0)
		return 0;

	unsigned int val = 0;
	for (size_t i = 0; i < len; ++i)
	{
		unsigned char c = (unsigned char)input[i];
		if (!isdigit(c))
			return 0;
		val = val * 10 + (c - '0');
		if (val > 255)
			return 0;
	}
	return 1;
}

// Helper: process U8 suffix input
static char *process_u8_input(const char *input, size_t inlen)
{
	// Check for negative (error)
	if (input[0] == '-')
		return alloc_string("Error");

	size_t outlen = inlen - 2;

	// Validate the numeric portion
	if (!validate_u8_range(input, outlen))
		return alloc_string("Error");

	// Return stripped value
	char *res = (char *)malloc(outlen + 1);
	if (!res)
		return NULL;
	memcpy(res, input, outlen);
	res[outlen] = '\0';
	return res;
}

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
			return process_u8_input(input, inlen);
		}
	}

	return alloc_string("stubbed");
}
