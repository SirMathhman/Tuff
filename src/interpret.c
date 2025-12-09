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
	for (size_t i = 0; i < len; ++i)
	{
		if (input[i] == '+')
			return 1;
		if (input[i] == '*')
			return 1;
		// treat '-' as operator only if not the very first char (to allow leading negative values)
		if (input[i] == '-' && i > 0)
			return 1;
	}
	return 0;
}

// Helper: reduce multiplication segments (respect precedence)
static char *reduce_multiplications(int n, unsigned long long *u_vals, long long *s_vals, char *ops, int common_bits, int common_signed, int *out_n, unsigned long long **out_u, long long **out_s, char **out_ops)
{
	unsigned long long umax = 0ULL, sm = 0ULL, sp = 0ULL;
	if (!compute_limits(common_bits, &umax, &sm, &sp))
		return alloc_error();

	unsigned long long *u_new = malloc(sizeof(unsigned long long) * n);
	long long *s_new = malloc(sizeof(long long) * n);
	char *ops_new = malloc(sizeof(char) * (n > 0 ? n - 1 : 0));
	if (!u_new || !s_new || (n > 0 && !ops_new))
	{
		free(u_new);
		free(s_new);
		free(ops_new);
		return alloc_error();
	}

	int idx = 0;
	if (!common_signed)
	{
		unsigned long long cur = u_vals[0];
		for (int i = 0; i < n - 1; ++i)
		{
			char op = ops[i];
			if (op == '*')
			{
				unsigned long long rhs = u_vals[i + 1];
				unsigned __int128 prod = (unsigned __int128)cur * (unsigned __int128)rhs;
				if (prod > umax)
				{
					free(u_new);
					free(s_new);
					free(ops_new);
					return alloc_error();
				}
				cur = (unsigned long long)prod;
			}
			else
			{
				u_new[idx++] = cur;
				ops_new[idx - 1] = op;
				cur = u_vals[i + 1];
			}
		}
		u_new[idx++] = cur;
		*out_n = idx;
		*out_u = u_new;
		*out_s = NULL;
		*out_ops = ops_new;
		return NULL;
	}

	long long cur = s_vals[0];
	long long min = -((long long)sm), max = (long long)sp;
	for (int i = 0; i < n - 1; ++i)
	{
		char op = ops[i];
		if (op == '*')
		{
			long long rhs = s_vals[i + 1];
			__int128 prod = (__int128)cur * (__int128)rhs;
			if (prod < min || prod > max)
			{
				free(u_new);
				free(s_new);
				free(ops_new);
				return alloc_error();
			}
			cur = (long long)prod;
		}
		else
		{
			s_new[idx++] = cur;
			ops_new[idx - 1] = op;
			cur = s_vals[i + 1];
		}
	}
	s_new[idx++] = cur;
	*out_n = idx;
	*out_u = NULL;
	*out_s = s_new;
	*out_ops = ops_new;
	return NULL;
}

static char *evaluate_add_sub_unsigned(int n, unsigned long long *vals, char *ops, int bits)
{
	unsigned long long umax = 0ULL, sm = 0ULL, sp = 0ULL;
	if (!compute_limits(bits, &umax, &sm, &sp))
		return alloc_error();
	unsigned long long acc = vals[0];
	for (int i = 0; i < n - 1; ++i)
	{
		char op = ops[i];
		unsigned long long v = vals[i + 1];
		if (op == '+')
		{
			if (!accumulate_unsigned(&acc, v, bits))
				return alloc_error();
		}
		else if (op == '-')
		{
			if (v > acc)
				return alloc_error();
			acc = acc - v;
		}
		else
			return alloc_error();
	}
	return fmt_ull(acc);
}

static char *evaluate_add_sub_signed(int n, long long *vals, char *ops, int bits)
{
	unsigned long long umax = 0ULL, sm = 0ULL, sp = 0ULL;
	if (!compute_limits(bits, &umax, &sm, &sp))
		return alloc_error();
	long long min = -((long long)sm), max = (long long)sp;
	long long acc = vals[0];
	for (int i = 0; i < n - 1; ++i)
	{
		char op = ops[i];
		long long v = vals[i + 1];
		long long addv = (op == '+') ? v : -v;
		__int128 s = (__int128)acc + (__int128)addv;
		if (s < min || s > max)
			return alloc_error();
		acc = (long long)s;
	}
	return fmt_ll(acc);
}

static int count_operators(const char *input, size_t len)
{
	int op_count = 0;
	for (size_t i = 0; i < len; ++i)
	{
		if (input[i] == '+')
			op_count++;
		else if (input[i] == '*')
			op_count++;
		else if (input[i] == '-' && i > 0)
			op_count++;
	}
	return op_count;
}

static void free_parse_buffers(unsigned long long *u_vals, long long *s_vals, int *bits, int *signedness, char *ops)
{
	free(u_vals);
	free(s_vals);
	free(bits);
	free(signedness);
	free(ops);
}

static char *alloc_parse_buffers(int n, unsigned long long **u_vals, long long **s_vals, int **bits, int **signedness, char **ops)
{
	*u_vals = malloc(sizeof(unsigned long long) * n);
	*s_vals = malloc(sizeof(long long) * n);
	*bits = malloc(sizeof(int) * n);
	*signedness = malloc(sizeof(int) * n);
	*ops = malloc(sizeof(char) * (n - 1));
	if (!*u_vals || !*s_vals || !*bits || !*signedness || (n > 1 && !*ops))
	{
		free_parse_buffers(*u_vals, *s_vals, *bits, *signedness, *ops);
		return alloc_error();
	}
	return NULL;
}

static size_t find_next_operator(const char *input, size_t len, size_t start)
{
	size_t next = start;
	while (next < len && !(input[next] == '+' || input[next] == '*' || (input[next] == '-' && next > start)))
		next++;
	return next;
}

static char *trim_and_parse_operand(const char *input, size_t pos, size_t next, int *obits, int *osig, int *oneg, unsigned long long *omag)
{
	size_t a = pos, b = next;
	while (a < b && input[a] == ' ')
		a++;
	while (b > a && input[b - 1] == ' ')
		b--;
	if (a >= b)
		return alloc_error();
	if (!parse_operand(input + a, b - a, obits, osig, oneg, omag))
		return alloc_error();
	return NULL;
}

static void store_operand(int idx, int obits, int osig, int oneg, unsigned long long omag, unsigned long long *u_vals, long long *s_vals, int *bits, int *signedness)
{
	bits[idx] = obits;
	signedness[idx] = osig;
	if (!osig)
		u_vals[idx] = omag;
	else
		s_vals[idx] = oneg ? -((long long)omag) : (long long)omag;
}

static char *parse_all_operands(const char *input, size_t len, int n, unsigned long long *u_vals, long long *s_vals, int *bits, int *signedness, char *ops, int *out_count)
{
	size_t pos = 0;
	int idx = 0;
	while (pos < len && idx < n)
	{
		size_t next = find_next_operator(input, len, pos);
		int obits = 0, osig = 0, oneg = 0;
		unsigned long long omag = 0ULL;
		char *err = trim_and_parse_operand(input, pos, next, &obits, &osig, &oneg, &omag);
		if (err)
			return err;

		store_operand(idx, obits, osig, oneg, omag, u_vals, s_vals, bits, signedness);

		if (next < len)
		{
			ops[idx] = input[next];
			pos = next + 1;
		}
		else
			pos = next;
		idx++;
	}
	*out_count = idx;
	return NULL;
}

static char *validate_homogeneous_types(int count, int *bits, int *signedness, int *out_bits, int *out_signed)
{
	*out_bits = bits[0];
	*out_signed = signedness[0];
	for (int i = 1; i < count; ++i)
		if (bits[i] != *out_bits || signedness[i] != *out_signed)
			return alloc_error();
	return NULL;
}

static char *try_handle_addition(const char *input)
{
	size_t len = strlen(input);
	if (!contains_operator(input, len))
		return NULL;

	int op_count = count_operators(input, len);
	int n = op_count + 1;
	if (n < 2)
		return NULL;

	unsigned long long *u_vals = NULL;
	long long *s_vals = NULL;
	int *bits = NULL;
	int *signedness = NULL;
	char *ops = NULL;
	char *err = alloc_parse_buffers(n, &u_vals, &s_vals, &bits, &signedness, &ops);
	if (err)
		return err;

	int count = 0;
	err = parse_all_operands(input, len, n, u_vals, s_vals, bits, signedness, ops, &count);
	if (err)
	{
		free_parse_buffers(u_vals, s_vals, bits, signedness, ops);
		return err;
	}
	if (count < 2)
	{
		free_parse_buffers(u_vals, s_vals, bits, signedness, ops);
		return NULL;
	}

	int common_bits = 0, common_signed = 0;
	err = validate_homogeneous_types(count, bits, signedness, &common_bits, &common_signed);
	if (err)
	{
		free_parse_buffers(u_vals, s_vals, bits, signedness, ops);
		return err;
	}

	int reduced_n = 0;
	unsigned long long *u_reduced = NULL;
	long long *s_reduced = NULL;
	char *ops_reduced = NULL;
	err = reduce_multiplications(count, u_vals, s_vals, ops, common_bits, common_signed, &reduced_n, &u_reduced, &s_reduced, &ops_reduced);
	free_parse_buffers(u_vals, s_vals, bits, signedness, ops);
	if (err)
		return err;

	char *out = NULL;
	if (!common_signed)
		out = evaluate_add_sub_unsigned(reduced_n, u_reduced, ops_reduced, common_bits);
	else
		out = evaluate_add_sub_signed(reduced_n, s_reduced, ops_reduced, common_bits);

	free(u_reduced);
	free(s_reduced);
	free(ops_reduced);
	return out;
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
