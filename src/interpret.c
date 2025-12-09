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

// Helper: return an allocated "Error" string
static char *alloc_error(void)
{
	return alloc_string("Error");
}

// Helper: detect suffix (U/I + 8/16/32/64). Returns suffix length or 0.
static int ends_with_ci(const char *s, size_t len, const char *suffix)
{
	size_t suf_len = strlen(suffix);
	if (suf_len > len)
		return 0;
	const char *p = s + len - suf_len;
	for (size_t i = 0; i < suf_len; ++i)
	{
		char a = p[i];
		char b = suffix[i];
		if (a >= 'A' && a <= 'Z')
			a = a - 'A' + 'a';
		if (b >= 'A' && b <= 'Z')
			b = b - 'A' + 'a';
		if (a != b)
			return 0;
	}
	return 1;
}

static int detect_suffix(const char *input, size_t inlen, int *is_signed, int *bits)
{
	struct
	{
		const char *suf;
		int is_signed;
		int bits;
	} table[] = {
			{"U8", 0, 8}, {"I8", 1, 8}, {"U16", 0, 16}, {"I16", 1, 16}, {"U32", 0, 32}, {"I32", 1, 32}, {"U64", 0, 64}, {"I64", 1, 64}};
	for (size_t i = 0; i < sizeof(table) / sizeof(table[0]); ++i)
	{
		if (ends_with_ci(input, inlen, table[i].suf))
		{
			*is_signed = table[i].is_signed;
			*bits = table[i].bits;
			return (int)strlen(table[i].suf);
		}
	}
	return 0;
}

// Validate numeric substring and return allocated stripped string or Error.
// For unsigned types, leading '-' is invalid. For signed types, leading '-' allowed.
static int parse_unsigned_digits(const char *s, size_t len, unsigned long long *out)
{
	if (len == 0)
		return 0;
	unsigned long long v = 0ULL;
	for (size_t i = 0; i < len; ++i)
	{
		unsigned char c = (unsigned char)s[i];
		if (!isdigit(c))
			return 0;
		unsigned int digit = c - '0';
		if (v > (ULLONG_MAX / 10ULL))
			return 0;
		if (v == (ULLONG_MAX / 10ULL) && digit > (ULLONG_MAX % 10ULL))
			return 0;
		v = v * 10ULL + digit;
	}
	*out = v;
	return 1;
}

static int compute_limits(int bits, unsigned long long *unsigned_max, unsigned long long *signed_mag_max, unsigned long long *signed_pos_max)
{
	switch (bits) {
		case 8:  *unsigned_max = 0xFFULL; *signed_mag_max = 0x80ULL; *signed_pos_max = 0x7FULL; return 1;
		case 16: *unsigned_max = 0xFFFFULL; *signed_mag_max = 0x8000ULL; *signed_pos_max = 0x7FFFULL; return 1;
		case 32: *unsigned_max = 0xFFFFFFFFULL; *signed_mag_max = 0x80000000ULL; *signed_pos_max = 0x7FFFFFFFULL; return 1;
		case 64: *unsigned_max = ~0ULL; *signed_mag_max = (1ULL<<63); *signed_pos_max = (1ULL<<63)-1ULL; return 1;
		default: return 0;
	}
}

static int validate_parsed_value(unsigned long long val, int bits, int is_signed, int negative)
{
	unsigned long long unsigned_max = 0ULL;
	unsigned long long signed_mag_max = 0ULL;
	unsigned long long signed_pos_max = 0ULL;
	if (!compute_limits(bits, &unsigned_max, &signed_mag_max, &signed_pos_max)) return 0;

	if (is_signed) {
		if (negative) return val <= signed_mag_max;
		return val <= signed_pos_max;
	}
	return val <= unsigned_max;
}

static char *process_integer_input(const char *input, size_t inlen, int bits, int is_signed)
{
	size_t suffix_len = (bits == 8 ? 2 : 3);
	size_t outlen = inlen - suffix_len;
	if (outlen == 0) return alloc_error();

	int negative = 0; size_t idx = 0;
	if (is_signed && input[0] == '-') { negative = 1; idx = 1; if (outlen == 1) return alloc_error(); }
	if (!is_signed && input[0] == '-') return alloc_error();

	unsigned long long val = 0ULL;
	if (!parse_unsigned_digits(input + idx, outlen - idx, &val)) return alloc_error();

	if (!validate_parsed_value(val, bits, is_signed, negative)) return alloc_error();

	char *res = (char *)malloc(outlen + 1);
	if (!res) return NULL;
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
		int is_signed = 0;
		int bits = 0;
		int suf = detect_suffix(input, inlen, &is_signed, &bits);
		if (suf > 0)
		{
			return process_integer_input(input, inlen, bits, is_signed);
		}
	}

	return alloc_string("stubbed");
}
