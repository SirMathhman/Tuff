/* interpret: parses typed integers with suffixes and supports multi-operand addition
 * Supported suffixes (case-insensitive): U8, U16, U32, U64, I8, I16, I32, I64
 * Examples:
 *   interpret("100U8") -> "100"
 *   interpret("1U8 + 2U8 + 3U8") -> "6"
 *   returns "Error" for overflow, mixed types, or invalid inputs
 */

#include "interpret.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <ctype.h>
#include <limits.h>

static char *alloc_string(const char *s)
{
	size_t n = strlen(s);
	char *r = malloc(n + 1);
	if (!r)
		return NULL;
	memcpy(r, s, n + 1);
	return r;
}

static char *alloc_error(void) { return alloc_string("Error"); }

static int ends_with_ci(const char *input, size_t inlen, const char *suf)
{
	size_t sl = strlen(suf);
	if (sl > inlen)
		return 0;
	const char *p = input + (inlen - sl);
	for (size_t i = 0; i < sl; ++i)
		if (tolower((unsigned char)p[i]) != tolower((unsigned char)suf[i]))
			return 0;
	return 1;
}

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
		unsigned int d = c - '0';
		if (v > ULLONG_MAX / 10ULL)
			return 0;
		if (v == ULLONG_MAX / 10ULL && d > (unsigned int)(ULLONG_MAX % 10ULL))
			return 0;
		v = v * 10ULL + d;
	}
	*out = v;
	return 1;
}

static int detect_suffix(const char *input, size_t len, int *is_signed, int *bits)
{
	struct
	{
		const char *s;
		int is_signed;
		int bits;
	} table[] = {
			{"U8", 0, 8}, {"I8", 1, 8}, {"U16", 0, 16}, {"I16", 1, 16}, {"U32", 0, 32}, {"I32", 1, 32}, {"U64", 0, 64}, {"I64", 1, 64}};
	for (size_t i = 0; i < sizeof(table) / sizeof(table[0]); ++i)
	{
		if (ends_with_ci(input, len, table[i].s))
		{
			*is_signed = table[i].is_signed;
			*bits = table[i].bits;
			return (int)strlen(table[i].s);
		}
	}
	return 0;
}

static int compute_limits(int bits, unsigned long long *unsigned_max, unsigned long long *signed_mag_max, unsigned long long *signed_pos_max)
{
	switch (bits)
	{
	case 8:
		*unsigned_max = 0xFFULL;
		*signed_mag_max = 0x80ULL;
		*signed_pos_max = 0x7FULL;
		return 1;
	case 16:
		*unsigned_max = 0xFFFFULL;
		*signed_mag_max = 0x8000ULL;
		*signed_pos_max = 0x7FFFULL;
		return 1;
	case 32:
		*unsigned_max = 0xFFFFFFFFULL;
		*signed_mag_max = 0x80000000ULL;
		*signed_pos_max = 0x7FFFFFFFULL;
		return 1;
	case 64:
		*unsigned_max = ~0ULL;
		*signed_mag_max = (1ULL << 63);
		*signed_pos_max = (1ULL << 63) - 1ULL;
		return 1;
	default:
		return 0;
	}
}

static int validate_parsed_value(unsigned long long mag, int bits, int is_signed, int negative)
{
	unsigned long long umax, sm, sp;
	if (!compute_limits(bits, &umax, &sm, &sp))
		return 0;
	if (is_signed)
	{
		if (negative)
			return mag <= sm;
		else
			return mag <= sp;
	}
	return mag <= umax;
}

static int parse_operand(const char *s, size_t len, int *out_bits, int *out_signed, int *out_negative, unsigned long long *out_val)
{
	if (len == 0)
		return 0;
	int is_signed = 0;
	int bits = 0;
	int suf = detect_suffix(s, len, &is_signed, &bits);
	if (!suf)
		return 0;
	size_t base_len = len - (size_t)suf;
	if (base_len == 0)
		return 0;
	size_t idx = 0;
	int neg = 0;
	if (is_signed && s[0] == '-')
	{
		neg = 1;
		idx = 1;
		if (base_len == 1)
			return 0;
	}
	if (!is_signed && s[0] == '-')
		return 0;
	unsigned long long mag = 0ULL;
	if (!parse_unsigned_digits(s + idx, base_len - idx, &mag))
		return 0;
	if (!validate_parsed_value(mag, bits, is_signed, neg))
		return 0;
	*out_bits = bits;
	*out_signed = is_signed;
	*out_negative = neg;
	*out_val = mag;
	return 1;
}

static int accumulate_unsigned(unsigned long long *sum, unsigned long long add, int bits)
{
	unsigned long long umax, sm, sp;
	if (!compute_limits(bits, &umax, &sm, &sp))
		return 0;
	if (add > umax - *sum)
		return 0;
	*sum += add;
	return 1;
}

static int accumulate_signed(long long *sum, int neg, unsigned long long add, int bits)
{
	unsigned long long umax, sm, sp;
	if (!compute_limits(bits, &umax, &sm, &sp))
		return 0;
	long long addv = neg ? -((long long)add) : (long long)add;
	long long min = -((long long)sm);
	long long max = (long long)sp;
	long long s = *sum + addv;
	if (s < min || s > max)
		return 0;
	*sum = s;
	return 1;
}

static char *fmt_ull(unsigned long long v)
{
	char buf[32];
	int n = snprintf(buf, sizeof(buf), "%llu", v);
	if (n <= 0)
		return NULL;
	return alloc_string(buf);
}

static char *fmt_ll(long long v)
{
	char buf[32];
	int n = snprintf(buf, sizeof(buf), "%lld", v);
	if (n <= 0)
		return NULL;
	return alloc_string(buf);
}

static int contains_operator(const char *input, size_t len)
{
	for (size_t i = 0; i < len; ++i) {
		if (input[i] == '+') return 1;
		// treat '-' as operator only if not the very first char (to allow leading negative values)
		if (input[i] == '-' && i > 0) return 1;
	}
	return 0;
}

static char *init_first_operand(int bits, int is_signed, int neg, unsigned long long mag, int *common_bits, int *common_signed, unsigned long long *u_sum, long long *s_sum)
{
	*common_bits = bits;
	*common_signed = is_signed;
	if (!is_signed)
		*u_sum = mag;
	else
		*s_sum = neg ? -((long long)mag) : (long long)mag;
	return NULL;
}

static char *apply_operand_op(int bits, int is_signed, int neg, unsigned long long mag, int common_bits, int common_signed, unsigned long long *u_sum, long long *s_sum, char op)
{
	if (bits != common_bits || is_signed != common_signed)
		return alloc_error();
	if (!common_signed)
	{
		if (op == '+') {
			if (!accumulate_unsigned(u_sum, mag, common_bits)) return alloc_error();
		} else if (op == '-') {
			if (mag > *u_sum) return alloc_error();
			*u_sum = *u_sum - mag;
		} else return alloc_error();
	}
	else
	{
		// For signed types we can treat operator '-' as adding the negated operand
		int effective_neg = (op == '-') ? !neg : neg;
		if (!accumulate_signed(s_sum, effective_neg, mag, common_bits)) return alloc_error();
	}
	return NULL;
}

static char *process_one_operand(const char *input, size_t a, size_t b, int count, int *common_bits, int *common_signed, unsigned long long *u_sum, long long *s_sum, char op)
{
	int bits = 0, is_signed = 0, neg = 0;
	unsigned long long mag = 0ULL;
	if (!parse_operand(input + a, b - a, &bits, &is_signed, &neg, &mag))
		return alloc_error();

	if (count == 0)
		return init_first_operand(bits, is_signed, neg, mag, common_bits, common_signed, u_sum, s_sum);
	return apply_operand_op(bits, is_signed, neg, mag, *common_bits, *common_signed, u_sum, s_sum, op);
}

static char *try_handle_addition(const char *input)
{
	size_t len = strlen(input);
	if (!contains_operator(input, len))
		return NULL;

	size_t pos = 0;
	int count = 0;
	int common_bits = 0, common_signed = 0;
	unsigned long long u_sum = 0ULL;
	long long s_sum = 0LL;
	char prev_op = '+'; // first operand treated as if preceded by +
	while (pos < len)
	{
		size_t next = pos;
		while (next < len && input[next] != '+' && input[next] != '-')
			next++;
		size_t a = pos, b = next;
		while (a < b && input[a] == ' ')
			a++;
		while (b > a && input[b - 1] == ' ')
			b--;
		if (a >= b)
			return alloc_error();

		char *err = process_one_operand(input, a, b, count, &common_bits, &common_signed, &u_sum, &s_sum, prev_op);
		if (err)
			return err;

		count++;
		if (next < len) {
			prev_op = input[next];
			pos = next + 1;
		} else pos = next;
	}
	if (count < 2)
		return NULL;
	if (!common_signed)
		return fmt_ull(u_sum);
	return fmt_ll(s_sum);
}

static char *process_integer_input(const char *input)
{
	size_t len = strlen(input);
	int is_signed = 0, bits = 0;
	int suf = detect_suffix(input, len, &is_signed, &bits);
	if (!suf)
		return NULL;

	int neg = 0;
	unsigned long long mag = 0ULL;
	if (!parse_operand(input, len, &bits, &is_signed, &neg, &mag))
		return alloc_error();
	size_t base_len = len - (size_t)suf;
	char *res = malloc(base_len + 1);
	if (!res)
		return NULL;
	memcpy(res, input, base_len);
	res[base_len] = '\0';
	return res;
}

char *interpret(const char *input)
{
	if (!input)
		return NULL;

	char *r = try_handle_addition(input);
	if (r)
		return r;

	r = process_integer_input(input);
	if (r)
		return r;

	return alloc_string("stubbed");
}
